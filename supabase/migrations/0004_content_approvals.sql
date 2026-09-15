-- Lumo-Ops — Phase 3 content drafts and approvals
-- Tasks: T3.1 (tables + RLS), T3.7 (audit on every decision), T3.8 (approval authority),
--        T3.9 (edit-and-approve keeps both payloads)
--
-- Constitution I: draft, never auto-publish. Nothing in this migration, and
-- nothing that reads it, contacts an external surface. `published` is a status
-- a human sets after publishing manually elsewhere.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.draft_status as enum (
  'draft', 'awaiting_approval', 'approved', 'rejected', 'published'
);

create type public.approval_decision as enum ('approved', 'rejected', 'edited_and_approved');

-- ---------------------------------------------------------------------------
-- FR-Q-001 — approval authority
--
-- "Editor: create drafts, run bots, approve if permitted." The phrase "if
-- permitted" implies a grant, so it is a per-membership flag an owner sets.
-- Owners always approve; editors approve only when granted; viewers never.
--
-- ASSUMPTION, not a user decision: FR-Q-001 was never answered. Recorded in
-- spec.md. If the intent was instead "editors may approve content but not
-- campaigns", this column becomes a per-target-type grant.
-- ---------------------------------------------------------------------------

alter table public.memberships
  add column can_approve boolean not null default false;

create function public.can_approve(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace
      and m.user_id = auth.uid()
      and (m.role = 'owner' or (m.role = 'editor' and m.can_approve))
  );
$$;

-- ---------------------------------------------------------------------------
-- content_drafts
-- ---------------------------------------------------------------------------

create table public.content_drafts (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  id               uuid primary key default gen_random_uuid(),
  topic            text not null check (length(trim(topic)) between 1 and 300),
  platform         text not null check (length(trim(platform)) between 1 and 60),
  audience         text not null default '',
  tone             text not null default '',
  length_hint      text not null default '',
  payload_json     jsonb not null,
  -- T3.9: edit-and-approve must leave both versions traceable, so the model's
  -- original is kept verbatim and never overwritten by a human edit.
  original_payload jsonb,
  status           public.draft_status not null default 'awaiting_approval',
  run_id           uuid references public.ai_run_logs (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index content_drafts_workspace_status_idx
  on public.content_drafts (workspace_id, status, created_at desc);

create trigger content_drafts_touch_updated_at
  before update on public.content_drafts
  for each row execute function public.touch_updated_at();

-- Constitution I, enforced in the schema: a draft may only be born awaiting a
-- human. Nothing may insert one already approved or published.
create function public.enforce_draft_birth_status()
returns trigger
language plpgsql
as $$
begin
  if new.status not in ('draft', 'awaiting_approval') then
    raise exception 'a new draft must start as draft or awaiting_approval, not %', new.status;
  end if;
  return new;
end;
$$;

create trigger content_drafts_birth_status
  before insert on public.content_drafts
  for each row execute function public.enforce_draft_birth_status();

-- ---------------------------------------------------------------------------
-- approvals — the record of a human decision
-- ---------------------------------------------------------------------------

create table public.approvals (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('content_draft', 'campaign')),
  target_id    uuid not null,
  status       public.approval_decision not null,
  reviewer_id  uuid references public.profiles (id) on delete set null,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create index approvals_workspace_target_idx
  on public.approvals (workspace_id, target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- decide_on_draft() — the single approval path
--
-- One SECURITY DEFINER function performs all four writes atomically: the status
-- change, the preserved original payload, the approvals row, and the audit row.
-- Doing it in one place is what makes "every approval is audited"
-- (Constitution VII, FR-S-003, SC-006) true by construction rather than by
-- remembering to call two things.
-- ---------------------------------------------------------------------------

create function public.decide_on_draft(
  draft_id uuid,
  decision public.approval_decision,
  edited_payload jsonb default null,
  reviewer_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.content_drafts;
  approval_id uuid;
  new_status public.draft_status;
begin
  select * into draft from public.content_drafts where id = draft_id for update;

  if draft.id is null then
    raise exception 'draft not found';
  end if;

  if not public.can_approve(draft.workspace_id) then
    raise exception 'you do not have approval rights in this workspace'
      using errcode = '42501';
  end if;

  if draft.status not in ('draft', 'awaiting_approval') then
    raise exception 'this draft has already been decided (status: %)', draft.status;
  end if;

  new_status := case decision
    when 'rejected' then 'rejected'::public.draft_status
    else 'approved'::public.draft_status
  end;

  if decision = 'edited_and_approved' then
    if edited_payload is null then
      raise exception 'edited_and_approved requires an edited payload';
    end if;

    update public.content_drafts
    set status = new_status,
        -- Keep the model's original the first time a human edits it.
        original_payload = coalesce(original_payload, payload_json),
        payload_json = edited_payload
    where id = draft_id;
  else
    update public.content_drafts set status = new_status where id = draft_id;
  end if;

  insert into public.approvals
    (workspace_id, target_type, target_id, status, reviewer_id, notes)
  values
    (draft.workspace_id, 'content_draft', draft_id, decision, auth.uid(), coalesce(reviewer_notes, ''))
  returning id into approval_id;

  perform public.write_audit(
    draft.workspace_id,
    'approval.' || decision::text,
    'content_draft',
    draft_id,
    jsonb_build_object('notes', coalesce(reviewer_notes, ''))
  );

  return approval_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_draft_published() — a record of manual action, never an action
--
-- FR-A-003 and Constitution I. This function changes a status and writes an
-- audit row. It makes no outbound call, and there is no code in this repository
-- that could: no social or publishing SDK is a dependency, which
-- scripts/check-no-publish.mjs enforces at build time.
-- ---------------------------------------------------------------------------

create function public.mark_draft_published(draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.content_drafts;
begin
  select * into draft from public.content_drafts where id = draft_id for update;

  if draft.id is null then
    raise exception 'draft not found';
  end if;

  if not public.can_approve(draft.workspace_id) then
    raise exception 'you do not have approval rights in this workspace'
      using errcode = '42501';
  end if;

  if draft.status <> 'approved' then
    raise exception 'only an approved draft can be marked published (status: %)', draft.status;
  end if;

  update public.content_drafts
  set status = 'published', published_at = now()
  where id = draft_id;

  perform public.write_audit(
    draft.workspace_id, 'draft.marked_published', 'content_draft', draft_id,
    jsonb_build_object('note', 'status mark only; the system published nothing')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.content_drafts enable row level security;
alter table public.approvals      enable row level security;

alter table public.content_drafts force row level security;
alter table public.approvals      force row level security;

create policy content_drafts_select_member on public.content_drafts
  for select to authenticated
  using (public.is_member(workspace_id));

create policy content_drafts_insert_writer on public.content_drafts
  for insert to authenticated
  with check (public.can_write(workspace_id));

-- Status transitions go through decide_on_draft() / mark_draft_published(),
-- never through a direct UPDATE — so there is no UPDATE policy that would let a
-- client set status = 'approved' on its own.

create policy content_drafts_delete_writer on public.content_drafts
  for delete to authenticated
  using (public.can_write(workspace_id));

create policy approvals_select_member on public.approvals
  for select to authenticated
  using (public.is_member(workspace_id));

-- No INSERT policy on approvals: decisions are recorded by decide_on_draft()
-- alone, so an approval row cannot exist without the status change and audit
-- row that belong with it.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, delete on public.content_drafts to authenticated;
grant select on public.approvals to authenticated;
grant execute on function public.can_approve(uuid) to authenticated;
grant execute on function public.decide_on_draft(uuid, public.approval_decision, jsonb, text) to authenticated;
grant execute on function public.mark_draft_published(uuid) to authenticated;
