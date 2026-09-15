-- Lumo-Ops v2 — Phase 2: human actions on publish jobs and connected accounts
-- Tasks (specs/002-growth-platform-core/tasks.md): T2.11, T2.13, T2.14
-- Spec: US2 AC5, US4, FR-P-004b; decisions §5 (retries never double-count)
--
-- Split from 0011 to keep each migration readable. Depends on 0010 and 0011.

-- ---------------------------------------------------------------------------
-- Retry and cancel
-- ---------------------------------------------------------------------------

/**
 * FR-Q-107 is open, so retry is human-triggered only. Reuses the same job id,
 * which never double-counts the cap (decisions §5).
 */
create function public.request_publish_retry(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.publish_jobs;
begin
  select * into job from public.publish_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'publish job not found';
  end if;
  if not public.can_approve(job.workspace_id) then
    raise exception 'you do not have approval rights in this workspace' using errcode = '42501';
  end if;
  if job.status not in ('failed', 'blocked') then
    raise exception 'only a failed or blocked job can be retried (status: %)', job.status;
  end if;

  update public.publish_jobs
  set status = 'queued', scheduled_for = now(), platform_error = null
  where id = job.id;

  perform public.write_audit(job.workspace_id, 'publish.retry_requested', 'publish_job', job.id,
                             jsonb_build_object('previous_error', job.platform_error,
                                                'attempts', job.attempt_count));
end;
$$;

create function public.cancel_publish_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.publish_jobs;
begin
  select * into job from public.publish_jobs where id = p_job_id for update;
  if job.id is null then
    raise exception 'publish job not found';
  end if;
  if not public.can_approve(job.workspace_id) then
    raise exception 'you do not have approval rights in this workspace' using errcode = '42501';
  end if;
  if job.status not in ('scheduled', 'queued', 'blocked', 'failed') then
    raise exception 'this job can no longer be cancelled (status: %)', job.status;
  end if;

  update public.publish_jobs set status = 'cancelled' where id = job.id;
  perform public.write_audit(job.workspace_id, 'publish.cancelled', 'publish_job', job.id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Disconnect
-- ---------------------------------------------------------------------------

/** US2 AC5: disconnecting blocks what was waiting to publish to that account. */
create function public.revoke_connected_account(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.connected_accounts;
  blocked integer;
begin
  select * into account from public.connected_accounts where id = p_account_id for update;
  if account.id is null then
    raise exception 'account not found';
  end if;
  if not public.is_owner(account.workspace_id) then
    raise exception 'only an owner can disconnect accounts' using errcode = '42501';
  end if;

  update public.connected_accounts
  set revoked_at = now(), status = 'revoked', auto_enabled = false,
      access_token_encrypted = null, refresh_token_encrypted = null
  where id = account.id;

  update public.publish_jobs
  set status = 'blocked', platform_error = 'the target account was disconnected'
  where connected_account_id = account.id and status in ('scheduled', 'queued');
  get diagnostics blocked = row_count;

  perform public.write_audit(account.workspace_id, 'connector.disconnected', 'connected_account',
                             account.id, jsonb_build_object('platform', account.platform,
                                                            'jobs_blocked', blocked));
  return blocked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Display
-- ---------------------------------------------------------------------------

/** Publishes counted today (UTC), for cap displays. */
create function public.publishes_used_today(target_workspace uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.publish_jobs
  where workspace_id = target_workspace
    and public.is_member(target_workspace)
    and cap_counted
    and executed_on = (now() at time zone 'utc')::date;
$$;

-- ---------------------------------------------------------------------------
-- T2.13: publishing is no longer a manual status mark (conformance audit C6).
-- `published` is reachable only through finish_publish_job() (0011).
-- ---------------------------------------------------------------------------

drop function public.mark_draft_published(uuid);

-- ---------------------------------------------------------------------------
-- Grants — Supabase grants new functions to anon by default; take that back.
-- ---------------------------------------------------------------------------

revoke all on function public.request_publish_retry(uuid) from public, anon;
revoke all on function public.cancel_publish_job(uuid) from public, anon;
revoke all on function public.revoke_connected_account(uuid) from public, anon;
revoke all on function public.publishes_used_today(uuid) from public, anon;

grant execute on function public.request_publish_retry(uuid) to authenticated;
grant execute on function public.cancel_publish_job(uuid) to authenticated;
grant execute on function public.revoke_connected_account(uuid) to authenticated;
grant execute on function public.publishes_used_today(uuid) to authenticated;
