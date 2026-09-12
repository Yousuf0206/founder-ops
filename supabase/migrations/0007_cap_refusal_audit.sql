-- ---------------------------------------------------------------------------
-- Cap refusals were never actually recorded (fixes T2.8's audit half).
--
-- claim_ai_run() inserted the 'refused' row and then raised. The raise aborts
-- the transaction, so the insert on the line above it rolled back with the
-- error — the cap held, but the trail that proves it held was always empty.
--
-- The sibling service-role function claim_ai_run_system() (0005) already has
-- the right shape: record the refusal, return null, let the caller decide what
-- to do about it. This brings the authenticated path in line with it.
--
-- Callers must now treat a null return as "cap reached"; there is no longer an
-- exception to catch. See lib/ai/run.ts.
-- ---------------------------------------------------------------------------

create or replace function public.claim_ai_run(
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
    -- Commits, because this path returns rather than raising.
    insert into public.ai_run_logs (workspace_id, actor, action, status, error)
    values (target_workspace, auth.uid(), run_action, 'refused',
            format('daily AI run cap reached (%s of %s runs used today)', used, cap));

    return null;
  end if;

  insert into public.ai_run_logs (workspace_id, actor, action, status, model)
  values (target_workspace, auth.uid(), run_action, 'running', run_model)
  returning id into new_id;

  return new_id;
end;
$$;
