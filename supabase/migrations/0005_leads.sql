-- Lumo-Ops — Phase 4 inbound leads
-- Tasks: T4.1 (table + RLS), T4.2 (per-workspace ingest secret), T4.8 (duplicates)
--
-- Constitution IV: no cold outreach or bulk messaging. Nothing here can send
-- anything to a lead. The only outbound path in the product notifies the
-- workspace OWNER, who is a team member.

-- ---------------------------------------------------------------------------
-- FR-Q-003 / FR-Q-004 — lead vocabularies
--
-- ASSUMPTION, not a user decision. The spec left segment, intent, stage, and
-- the score scale undefined, and a classifier cannot be tested against free
-- text. Fixed vocabularies chosen:
--   segment: who they are
--   intent:  how ready they are  (high triggers the owner notification)
--   stage:   where the team has taken them
--   score:   0-100, with high intent at >= 70
-- Recorded in spec.md. Changing these is an enum migration, not a rewrite.
-- ---------------------------------------------------------------------------

create type public.lead_segment as enum (
  'student', 'parent', 'teacher', 'institution', 'partner', 'other', 'unknown'
);

create type public.lead_intent as enum ('high', 'medium', 'low', 'unknown');

create type public.lead_stage as enum (
  'new', 'classified', 'reviewing', 'contacted', 'qualified', 'archived'
);

-- ---------------------------------------------------------------------------
-- Per-workspace ingest secret (T4.2)
--
-- Stored as a SHA-256 hash, never in plaintext: an ingest key that leaks from
-- the database is as bad as one that leaks from a client.
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column ingest_secret_hash text,
  add column notify_email text;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------

create table public.leads (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'webhook' check (length(trim(source)) between 1 and 60),
  email         text not null check (position('@' in email) > 1),
  name          text,
  message       text not null default '',
  segment       public.lead_segment not null default 'unknown',
  intent        public.lead_intent not null default 'unknown',
  score         integer not null default 0 check (score between 0 and 100),
  stage         public.lead_stage not null default 'new',
  rationale     text not null default '',
  raw_payload   jsonb not null default '{}'::jsonb,
  run_id        uuid references public.ai_run_logs (id) on delete set null,
  notified_at   timestamptz,
  -- T4.8: the same person arriving from two sources is one lead with two
  -- sightings, not two leads. Counted rather than discarded, so the team can
  -- see that they asked twice — which is itself a signal of intent.
  seen_count    integer not null default 1,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index leads_workspace_created_idx on public.leads (workspace_id, created_at desc);
create index leads_workspace_intent_idx on public.leads (workspace_id, intent, stage);
create unique index leads_workspace_email_key on public.leads (workspace_id, lower(email));

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Ingest happens server-side with the service-role key after the request's
-- shared secret is verified, so there is no INSERT policy for authenticated
-- users. Members read; writers move a lead through its stages.
-- ---------------------------------------------------------------------------

alter table public.leads enable row level security;
alter table public.leads force row level security;

create policy leads_select_member on public.leads
  for select to authenticated
  using (public.is_member(workspace_id));

create policy leads_update_writer on public.leads
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

grant select, update on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- System-actor variants of the logging functions
--
-- The ingest route has no session, so auth.uid() is null and is_member() is
-- false. These variants skip the membership check because the caller has
-- already proven itself with the workspace's shared secret, and they record
-- actor = null, which reads as "the system" in the audit view.
--
-- They are NOT granted to `authenticated`. Only the service-role key can call
-- them, so a signed-in user cannot use them to forge an unattributed audit row.
-- ---------------------------------------------------------------------------

create function public.write_audit_system(
  target_workspace uuid,
  audit_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_logs (workspace_id, actor, action, target_type, target_id, meta)
  values (target_workspace, null, audit_action, p_target_type, p_target_id, p_meta)
  returning id into new_id;
  return new_id;
end;
$$;

/** Cap-checked run reservation for the sessionless ingest path.
    Returns null instead of raising when the cap is reached: a lead must still
    be stored even when it cannot be classified. */
create function public.claim_ai_run_system(
  target_workspace uuid,
  run_action text,
  run_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  cap integer;
  used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace::text, 0));

  select w.daily_run_cap into cap from public.workspaces w where w.id = target_workspace;
  if cap is null then
    return null;
  end if;

  select count(*) into used
  from public.ai_run_logs r
  where r.workspace_id = target_workspace
    and r.created_at >= date_trunc('day', now() at time zone 'utc')
    and r.status <> 'refused';

  if used >= cap then
    insert into public.ai_run_logs (workspace_id, actor, action, status, error)
    values (target_workspace, null, run_action, 'refused',
            format('daily cap reached (%s of %s runs used)', used, cap));
    return null;
  end if;

  insert into public.ai_run_logs (workspace_id, actor, action, status, model)
  values (target_workspace, null, run_action, 'running', run_model)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.finish_ai_run_system(
  run_id uuid,
  final_status public.run_status,
  p_prompt_tokens integer default null,
  p_output_tokens integer default null,
  p_cost_usd numeric default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_run_logs
  set status = final_status,
      prompt_tokens = coalesce(p_prompt_tokens, prompt_tokens),
      output_tokens = coalesce(p_output_tokens, output_tokens),
      cost_usd = coalesce(p_cost_usd, cost_usd),
      error = coalesce(p_error, error),
      finished_at = now()
  where id = run_id;
end;
$$;

-- Deliberately NOT granted to authenticated. Service-role only.
revoke all on function public.write_audit_system(uuid, text, text, uuid, jsonb) from public;
revoke all on function public.claim_ai_run_system(uuid, text, text) from public;
revoke all on function public.finish_ai_run_system(uuid, public.run_status, integer, integer, numeric, text) from public;
