-- Lumo-Ops — Phase 5 campaigns
-- Tasks: T5.1 (campaigns through the SAME approval pipeline as content)
--
-- FR-M-002 says campaigns use the same pipeline as content. That is taken
-- literally: `decide_on_campaign` mirrors `decide_on_draft` and writes into the
-- same `approvals` table, whose target_type check already allows 'campaign'.
--
-- A campaign payload may contain an email draft. Approving it sends nothing
-- (US6 scenario 3) — approval sets a status, and the only send path in this
-- product takes a workspace notify address, not a campaign payload.

create table public.campaigns (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  id               uuid primary key default gen_random_uuid(),
  goal             text not null check (length(trim(goal)) between 1 and 500),
  audience         text not null default '',
  payload_json     jsonb not null,
  original_payload jsonb,
  status           public.draft_status not null default 'awaiting_approval',
  run_id           uuid references public.ai_run_logs (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index campaigns_workspace_status_idx
  on public.campaigns (workspace_id, status, created_at desc);

create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- Same birth-status rule as content: a campaign cannot be born approved.
create trigger campaigns_birth_status
  before insert on public.campaigns
  for each row execute function public.enforce_draft_birth_status();

create function public.decide_on_campaign(
  campaign_id uuid,
  decision public.approval_decision,
  reviewer_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.campaigns;
  approval_id uuid;
  new_status public.draft_status;
begin
  select * into campaign from public.campaigns where id = campaign_id for update;

  if campaign.id is null then
    raise exception 'campaign not found';
  end if;

  if not public.can_approve(campaign.workspace_id) then
    raise exception 'you do not have approval rights in this workspace'
      using errcode = '42501';
  end if;

  if campaign.status not in ('draft', 'awaiting_approval') then
    raise exception 'this campaign has already been decided (status: %)', campaign.status;
  end if;

  new_status := case decision
    when 'rejected' then 'rejected'::public.draft_status
    else 'approved'::public.draft_status
  end;

  update public.campaigns set status = new_status where id = campaign_id;

  insert into public.approvals
    (workspace_id, target_type, target_id, status, reviewer_id, notes)
  values
    (campaign.workspace_id, 'campaign', campaign_id, decision, auth.uid(), coalesce(reviewer_notes, ''))
  returning id into approval_id;

  perform public.write_audit(
    campaign.workspace_id,
    'approval.' || decision::text,
    'campaign',
    campaign_id,
    jsonb_build_object('notes', coalesce(reviewer_notes, ''), 'sent_nothing', true)
  );

  return approval_id;
end;
$$;

alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;

create policy campaigns_select_member on public.campaigns
  for select to authenticated
  using (public.is_member(workspace_id));

create policy campaigns_insert_writer on public.campaigns
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy campaigns_delete_writer on public.campaigns
  for delete to authenticated
  using (public.can_write(workspace_id));

grant select, insert, delete on public.campaigns to authenticated;
grant execute on function public.decide_on_campaign(uuid, public.approval_decision, text) to authenticated;
