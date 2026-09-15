-- Lumo-Ops v2 — Phase 2: publish jobs, the guarded publish path
-- Tasks (specs/002-growth-platform-core/tasks.md): T2.5, T2.6, T2.7
-- Spec: US4, FR-P-004..011, FR-P-010a; decisions §5 (caps), §7 (claims), §8 (edge cases)
--
-- Every publish, in every mode, passes through these functions:
--   enqueue_publish_job()  rights, account, platform, mode, claims on the FINAL body
--   claim_publish_job()    re-checks all of it at execution, then reserves the cap
--   finish_publish_job()   stores the receipt (idempotency anchor) or the error
-- Each writes its audit row in the same transaction. Refusals RETURN rather
-- than raise, so the audit row that records them is committed (see 0007).
--
-- Human actions on jobs and accounts (retry, cancel, disconnect) are in 0012.

create type public.publish_job_status as enum (
  'scheduled', 'queued', 'publishing', 'published', 'failed', 'blocked', 'cancelled'
);

create table public.publish_jobs (
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  id                   uuid primary key default gen_random_uuid(),
  -- NO ACTION, not CASCADE: a draft or account with publish history cannot be
  -- deleted out from under its record. (Workspace deletion still cascades.)
  draft_id             uuid not null references public.content_drafts (id),
  connected_account_id uuid not null references public.connected_accounts (id),
  platform             text not null,
  mode                 public.publish_mode not null,
  -- Constitution VIII: an auto publish is attributed to its rule, never unattributed.
  actor                text not null check (actor ~ '^(user|rule):[0-9A-Za-z_-]+$'),
  claim_check          jsonb not null,
  -- The exact body that will be posted: the draft after any reviewer edit.
  body_snapshot        jsonb not null,
  scheduled_for        timestamptz not null default now(),
  status               public.publish_job_status not null,
  -- Decisions §5: counted once per job, on the UTC day it first executes.
  cap_counted          boolean not null default false,
  executed_on          date,
  attempt_count        integer not null default 0,
  last_attempt_at      timestamptz,
  external_id          text,
  permalink            text,
  platform_error       text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index publish_jobs_one_active_per_target
  on public.publish_jobs (draft_id, connected_account_id)
  where status in ('scheduled', 'queued', 'publishing', 'published', 'blocked');

create unique index publish_jobs_receipt_key
  on public.publish_jobs (connected_account_id, external_id)
  where external_id is not null;

create index publish_jobs_due_idx
  on public.publish_jobs (scheduled_for)
  where status in ('scheduled', 'queued', 'publishing');

create index publish_jobs_workspace_created_idx
  on public.publish_jobs (workspace_id, created_at desc);

create index publish_jobs_cap_idx
  on public.publish_jobs (workspace_id, executed_on)
  where cap_counted;

create trigger publish_jobs_touch_updated_at
  before update on public.publish_jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Claim-check helpers (internal: never granted to clients)
-- ---------------------------------------------------------------------------

/** Every string value in a payload, so escaping in JSON cannot hide a phrase. */
create function public.payload_text(p jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(v #>> '{}', E'\n'), '')
  from jsonb_path_query(p, 'strict $.**') as v
  where jsonb_typeof(v) = 'string';
$$;

create function public.forbidden_claims_in(target_workspace uuid, body text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(trim(c)), '{}')
  from public.claim_sets cs, unnest(cs.forbidden_claims) as c
  where cs.workspace_id = target_workspace
    and length(trim(c)) > 0
    and position(lower(trim(c)) in lower(body)) > 0;
$$;

create function public.has_approved_claims(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.claim_sets cs, unnest(cs.approved_claims) as c
    where cs.workspace_id = target_workspace and length(trim(c)) > 0
  );
$$;

-- ---------------------------------------------------------------------------
-- enqueue_publish_job() — a reviewer publishes now or schedules (US4 AC3–4)
-- ---------------------------------------------------------------------------

create function public.enqueue_publish_job(
  p_draft_id      uuid,
  p_account_id    uuid,
  p_scheduled_for timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.content_drafts;
  account public.connected_accounts;
  ws public.workspaces;
  run_at timestamptz := coalesce(p_scheduled_for, now());
  violations text[] := '{}';
  check_result jsonb;
  refusal text;
  job_id uuid;
begin
  select * into draft from public.content_drafts where id = p_draft_id for update;
  if draft.id is null then
    raise exception 'draft not found';
  end if;

  if not public.can_approve(draft.workspace_id) then
    raise exception 'you do not have approval rights in this workspace' using errcode = '42501';
  end if;

  select * into ws from public.workspaces where id = draft.workspace_id;
  select * into account from public.connected_accounts where id = p_account_id;

  if draft.status <> 'approved' then
    refusal := format('only an approved draft can be published (status: %s)', draft.status);
  elsif account.id is null or account.workspace_id <> draft.workspace_id then
    refusal := 'that account is not connected to this workspace';
  elsif account.revoked_at is not null or account.status <> 'active' then
    refusal := 'that account is disconnected or its token has expired; reconnect it first';
  elsif lower(account.platform) <> lower(draft.platform) then
    refusal := format('this draft is written for %s, not %s', draft.platform, account.platform);
  elsif ws.publish_mode = 'draft_only' then
    refusal := 'this workspace is in draft_only mode, so nothing publishes';
  elsif run_at < now() - interval '5 minutes' or run_at > now() + interval '90 days' then
    refusal := 'choose a time between now and 90 days from now';
  elsif not public.has_approved_claims(draft.workspace_id) then
    refusal := 'publishing is refused until the workspace has at least one approved claim';
  else
    violations := public.forbidden_claims_in(draft.workspace_id, public.payload_text(draft.payload_json));
    if cardinality(violations) > 0 then
      refusal := format('the final body contains forbidden claims: %s', array_to_string(violations, ', '));
    end if;
  end if;

  check_result := jsonb_build_object(
    'passed', cardinality(violations) = 0 and refusal is null,
    'violations', to_jsonb(violations),
    'checked_at', now()
  );

  if refusal is not null then
    perform public.write_audit(
      draft.workspace_id, 'publish.refused', 'content_draft', draft.id,
      jsonb_build_object('reason', refusal, 'account_id', p_account_id,
                         'mode', ws.publish_mode, 'claim_check', check_result)
    );
    return jsonb_build_object('job_id', null, 'refused', refusal);
  end if;

  insert into public.publish_jobs (
    workspace_id, draft_id, connected_account_id, platform, mode, actor,
    claim_check, body_snapshot, scheduled_for, status, created_by
  )
  values (
    draft.workspace_id, draft.id, account.id, account.platform, ws.publish_mode,
    'user:' || auth.uid()::text, check_result, draft.payload_json, run_at,
    (case when run_at <= now() + interval '1 minute' then 'queued' else 'scheduled' end)::public.publish_job_status,
    auth.uid()
  )
  returning id into job_id;

  perform public.write_audit(
    draft.workspace_id, 'publish.enqueued', 'publish_job', job_id,
    jsonb_build_object('draft_id', draft.id, 'account_id', account.id, 'platform', account.platform,
                       'mode', ws.publish_mode, 'scheduled_for', run_at, 'claim_check', check_result)
  );

  return jsonb_build_object('job_id', job_id, 'refused', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_publish_job() — the executor's gate, immediately before the platform call
--
-- Re-checks at execution time because things change between approval and a
-- scheduled time: the account can be disconnected, the mode switched, a
-- forbidden claim added, the cap consumed. Service role only.
-- ---------------------------------------------------------------------------

create function public.claim_publish_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.publish_jobs;
  ws public.workspaces;
  account public.connected_accounts;
  used integer;
  violations text[] := '{}';
  reason text;
  today date := (now() at time zone 'utc')::date;
begin
  select * into job from public.publish_jobs where id = p_job_id;
  if job.id is null then
    return jsonb_build_object('action', 'skip', 'reason', 'job not found');
  end if;

  -- Serialise execution per workspace so the cap count cannot be stale.
  perform pg_advisory_xact_lock(hashtextextended('publish-cap:' || job.workspace_id::text, 0));
  select * into job from public.publish_jobs where id = p_job_id for update;

  -- An attempt that started but never reported back: the platform may or may
  -- not have the post. Never re-post blindly (decisions §8) — a human checks.
  if job.status = 'publishing' then
    if job.last_attempt_at > now() - interval '10 minutes' then
      return jsonb_build_object('action', 'skip', 'reason', 'attempt in flight');
    end if;
    update public.publish_jobs
    set status = 'failed',
        platform_error = 'The previous attempt did not report back, so it is unknown whether the post went out. Check the account before retrying.'
    where id = job.id;
    perform public.write_audit_system(job.workspace_id, 'publish.outcome_unknown', 'publish_job', job.id,
                                      jsonb_build_object('attempt', job.attempt_count));
    return jsonb_build_object('action', 'skip', 'reason', 'outcome unknown');
  end if;

  if job.status not in ('queued', 'scheduled') or job.scheduled_for > now() then
    return jsonb_build_object('action', 'skip', 'reason', 'not due');
  end if;

  -- The receipt is the idempotency anchor: it already went out.
  if job.external_id is not null then
    update public.publish_jobs set status = 'published', platform_error = null where id = job.id;
    perform public.write_audit_system(job.workspace_id, 'publish.reconciled', 'publish_job', job.id,
                                      jsonb_build_object('external_id', job.external_id));
    return jsonb_build_object('action', 'reconciled');
  end if;

  select * into ws from public.workspaces where id = job.workspace_id;
  select * into account from public.connected_accounts where id = job.connected_account_id;

  if account.revoked_at is not null or account.status <> 'active' then
    reason := 'the target account is disconnected or its token expired; reconnect it, then retry';
  elsif ws.publish_mode = 'draft_only' then
    reason := 'the workspace is now in draft_only mode';
  elsif not public.has_approved_claims(ws.id) then
    reason := 'the workspace has no approved claims';
  else
    violations := public.forbidden_claims_in(ws.id, public.payload_text(job.body_snapshot));
    if cardinality(violations) > 0 then
      reason := format('the body now contains forbidden claims: %s', array_to_string(violations, ', '));
    end if;
  end if;

  if reason is null and not job.cap_counted then
    select count(*) into used
    from public.publish_jobs
    where workspace_id = ws.id and cap_counted and executed_on = today;

    if used >= ws.daily_publish_cap then
      reason := format('daily publish cap reached (%s of %s used today, UTC)', used, ws.daily_publish_cap);
    end if;
  end if;

  if reason is not null then
    update public.publish_jobs set status = 'blocked', platform_error = reason where id = job.id;
    perform public.write_audit_system(
      ws.id, 'publish.blocked', 'publish_job', job.id,
      jsonb_build_object('reason', reason, 'actor', job.actor, 'mode', job.mode,
                         'account_id', job.connected_account_id, 'violations', to_jsonb(violations))
    );
    return jsonb_build_object('action', 'blocked', 'reason', reason, 'workspace_id', ws.id);
  end if;

  update public.publish_jobs
  set status = 'publishing',
      executed_on = case when cap_counted then executed_on else today end,
      cap_counted = true,
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      platform_error = null
  where id = job.id;

  perform public.write_audit_system(
    ws.id, 'publish.started', 'publish_job', job.id,
    jsonb_build_object('attempt', job.attempt_count + 1, 'actor', job.actor, 'mode', job.mode,
                       'account_id', job.connected_account_id)
  );

  return jsonb_build_object('action', 'publish', 'workspace_id', ws.id,
                            'account_id', job.connected_account_id, 'platform', job.platform);
end;
$$;

/** Records the outcome of an in-flight attempt. Service role only. */
create function public.finish_publish_job(
  p_job_id      uuid,
  p_published   boolean,
  p_external_id text default null,
  p_permalink   text default null,
  p_error       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.publish_jobs;
begin
  select * into job from public.publish_jobs where id = p_job_id for update;
  if job.id is null or job.status <> 'publishing' then
    raise exception 'publish job % is not in flight', p_job_id;
  end if;

  if p_published then
    if p_external_id is null then
      raise exception 'a published job needs its platform receipt';
    end if;

    update public.publish_jobs
    set status = 'published', external_id = p_external_id, permalink = p_permalink, platform_error = null
    where id = job.id;

    update public.content_drafts
    set status = 'published', published_at = now()
    where id = job.draft_id and status = 'approved';

    perform public.write_audit_system(
      job.workspace_id, 'publish.published', 'publish_job', job.id,
      jsonb_build_object('external_id', p_external_id, 'permalink', p_permalink, 'actor', job.actor,
                         'mode', job.mode, 'account_id', job.connected_account_id,
                         'claim_check', job.claim_check)
    );
  else
    update public.publish_jobs
    set status = 'failed', platform_error = left(coalesce(p_error, 'unknown error'), 1000)
    where id = job.id;

    perform public.write_audit_system(
      job.workspace_id, 'publish.failed', 'publish_job', job.id,
      jsonb_build_object('error', left(coalesce(p_error, 'unknown error'), 1000), 'actor', job.actor,
                         'mode', job.mode, 'account_id', job.connected_account_id)
    );
  end if;
end;
$$;

/**
 * Due and stale jobs, oldest first, for the cron runner — or for one workspace
 * when a reviewer runs due jobs by hand (B1 fallback). Service role only.
 */
create function public.due_publish_jobs(p_limit integer default 20, p_workspace uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.publish_jobs
  where (p_workspace is null or workspace_id = p_workspace)
    and (
      (status in ('queued', 'scheduled') and scheduled_for <= now())
      or (status = 'publishing' and last_attempt_at < now() - interval '10 minutes')
    )
  order by scheduled_for
  limit least(greatest(p_limit, 1), 100);
$$;

/** Marks an account whose token the platform rejected. Service role only. */
create function public.mark_account_expired(p_account_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.connected_accounts;
begin
  select * into account from public.connected_accounts where id = p_account_id for update;
  if account.id is null or account.status <> 'active' then
    return;
  end if;

  update public.connected_accounts set status = 'expired', auto_enabled = false where id = account.id;

  perform public.write_audit_system(account.workspace_id, 'connector.expired', 'connected_account',
                                    account.id, jsonb_build_object('reason', left(p_reason, 500)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.publish_jobs enable row level security;
alter table public.publish_jobs force row level security;

-- Members read; every write goes through the functions in this file and 0012.
create policy publish_jobs_select_member on public.publish_jobs
  for select to authenticated
  using (public.is_member(workspace_id));

revoke all on public.publish_jobs from anon, authenticated;
grant select on public.publish_jobs to authenticated;

-- Supabase grants new functions to anon/authenticated by default: revoke
-- explicitly, then grant only what a signed-in reviewer may call.
revoke all on function public.payload_text(jsonb) from public, anon, authenticated;
revoke all on function public.forbidden_claims_in(uuid, text) from public, anon, authenticated;
revoke all on function public.has_approved_claims(uuid) from public, anon, authenticated;
revoke all on function public.claim_publish_job(uuid) from public, anon, authenticated;
revoke all on function public.finish_publish_job(uuid, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.due_publish_jobs(integer, uuid) from public, anon, authenticated;
revoke all on function public.mark_account_expired(uuid, text) from public, anon, authenticated;

revoke all on function public.enqueue_publish_job(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.enqueue_publish_job(uuid, uuid, timestamptz) to authenticated;
