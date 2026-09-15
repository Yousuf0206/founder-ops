-- Lumo-Ops — Phase 2 research, AI run logging, audit, and cost caps
-- Tasks: T2.1 (tables + RLS), T2.7 (cap stored as data), T2.8 (transactional cap)
--
-- Constitution VII: every AI run and approval is audited.
-- Constitution VIII: cost caps are mandatory.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.run_status as enum ('running', 'succeeded', 'failed', 'refused');

-- ---------------------------------------------------------------------------
-- ai_run_logs — one row per attempted AI run, created BEFORE the provider call
--
-- The row is the reservation. Creating it is how a run claims a slot against
-- the daily cap, which is why it exists even for runs that go on to fail.
-- ---------------------------------------------------------------------------

create table public.ai_run_logs (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  id            uuid primary key default gen_random_uuid(),
  actor         uuid references public.profiles (id) on delete set null,
  action        text not null check (length(trim(action)) between 1 and 60),
  status        public.run_status not null default 'running',
  model         text,
  prompt_tokens integer,
  output_tokens integer,
  cost_usd      numeric(10, 6),
  error         text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index ai_run_logs_workspace_created_idx
  on public.ai_run_logs (workspace_id, created_at desc);

-- The cap counts runs per UTC day (FR-Q-002), so index that shape directly.
create index ai_run_logs_workspace_day_idx
  on public.ai_run_logs (workspace_id, (created_at at time zone 'utc'));

-- ---------------------------------------------------------------------------
-- audit_logs — every consequential action, AI or human
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           uuid primary key default gen_random_uuid(),
  actor        uuid references public.profiles (id) on delete set null,
  action       text not null check (length(trim(action)) between 1 and 80),
  target_type  text,
  target_id    uuid,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_workspace_created_idx
  on public.audit_logs (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- research_reports
-- ---------------------------------------------------------------------------

create table public.research_reports (
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  id              uuid primary key default gen_random_uuid(),
  title           text not null default 'Research report',
  input_blob      text not null,
  output_json     jsonb,
  output_markdown text,
  status          public.run_status not null default 'running',
  error           text,
  run_id          uuid references public.ai_run_logs (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index research_reports_workspace_created_idx
  on public.research_reports (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Cap enforcement (T2.8)
--
-- Check and reserve in ONE statement. A plain "count, then insert" loses the
-- race that spec.md names as an edge case: two concurrent runs at the boundary
-- would both read 49 and both proceed.
--
-- The INSERT ... SELECT ... WHERE (count < cap) evaluates the count inside the
-- same statement that writes the row, and the advisory lock serialises
-- concurrent callers for the same workspace so the count cannot be stale.
-- ---------------------------------------------------------------------------

create function public.claim_ai_run(
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
  if not public.is_member(target_workspace) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  -- Serialise cap checks for this workspace. Released at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace::text, 0));

  select w.daily_run_cap into cap
  from public.workspaces w
  where w.id = target_workspace;

  if cap is null then
    raise exception 'workspace not found';
  end if;

  select count(*) into used
  from public.ai_run_logs r
  where r.workspace_id = target_workspace
    and r.created_at >= date_trunc('day', now() at time zone 'utc')
    and r.status <> 'refused';

  if used >= cap then
    -- Record the refusal so the cap is visible in the audit trail, then stop.
    insert into public.ai_run_logs (workspace_id, actor, action, status, error)
    values (target_workspace, auth.uid(), run_action, 'refused',
            format('daily cap reached (%s of %s runs used)', used, cap));

    raise exception 'daily AI run cap reached (% of % runs used today)', used, cap
      using errcode = 'P0001';
  end if;

  insert into public.ai_run_logs (workspace_id, actor, action, status, model)
  values (target_workspace, auth.uid(), run_action, 'running', run_model)
  returning id into new_id;

  return new_id;
end;
$$;

/** Closes out a run reserved by claim_ai_run(). */
create function public.finish_ai_run(
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
declare
  ws uuid;
begin
  select workspace_id into ws from public.ai_run_logs where id = run_id;

  if ws is null or not public.is_member(ws) then
    raise exception 'run not found' using errcode = '42501';
  end if;

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

/** Runs used today, for the settings and cap displays. */
create function public.ai_runs_used_today(target_workspace uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ai_run_logs r
  where r.workspace_id = target_workspace
    and public.is_member(target_workspace)
    and r.created_at >= date_trunc('day', now() at time zone 'utc')
    and r.status <> 'refused';
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ai_run_logs      enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.research_reports enable row level security;

alter table public.ai_run_logs      force row level security;
alter table public.audit_logs       force row level security;
alter table public.research_reports force row level security;

-- Logs are read-only to members. They are written by SECURITY DEFINER
-- functions, never by the client — an append-only record that the actor
-- cannot edit is the only kind worth auditing (Constitution VII).

create policy ai_run_logs_select_member on public.ai_run_logs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy audit_logs_select_member on public.audit_logs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy research_reports_select_member on public.research_reports
  for select to authenticated
  using (public.is_member(workspace_id));

create policy research_reports_insert_writer on public.research_reports
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy research_reports_update_writer on public.research_reports
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

create policy research_reports_delete_writer on public.research_reports
  for delete to authenticated
  using (public.can_write(workspace_id));

-- ---------------------------------------------------------------------------
-- Audit writer — SECURITY DEFINER so audit rows cannot be forged or skipped
-- ---------------------------------------------------------------------------

create function public.write_audit(
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
  if not public.is_member(target_workspace) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  insert into public.audit_logs (workspace_id, actor, action, target_type, target_id, meta)
  values (target_workspace, auth.uid(), audit_action, p_target_type, p_target_id, p_meta)
  returning id into new_id;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on public.ai_run_logs to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update, delete on public.research_reports to authenticated;

grant execute on function public.claim_ai_run(uuid, text, text) to authenticated;
grant execute on function public.finish_ai_run(uuid, public.run_status, integer, integer, numeric, text) to authenticated;
grant execute on function public.ai_runs_used_today(uuid) to authenticated;
grant execute on function public.write_audit(uuid, text, text, uuid, jsonb) to authenticated;
