-- Lumo-Ops v2 — Phase 3: auto-within-rules, team controls, seat limits
-- Tasks (specs/002-growth-platform-core/tasks.md): T3.1, T3.3, T3.4, T3.6, T5.3
-- Spec: US5 AC1–AC12, US7 AC4, FR-A-002/003; decisions §4 (auto shape), §6 (plans)
--
-- Auto mode adds a rule gate IN FRONT of the publish path and changes nothing
-- inside it: a rule-approved draft becomes an ordinary queued publish_job, and
-- claim_publish_job() still re-checks claims and reserves the cap at execution.

alter table public.workspaces
  add column auto_min_confidence integer
    check (auto_min_confidence is null or auto_min_confidence between 0 and 100);

-- FR-A-003: an auto decision is attributed to the rule, never left unattributed.
alter table public.approvals
  add column decided_by_rule text check (decided_by_rule is null or decided_by_rule ~ '^[a-z_]+$');

-- Set when auto evaluation found a forbidden claim and handed the draft to a
-- human (US5 AC2). Stops the same draft being re-evaluated every tick.
alter table public.content_drafts
  add column auto_review_reason text;

-- ---------------------------------------------------------------------------
-- enqueue_auto_publish_job() — the rule gate (mirrored in lib/publish/rules.ts)
-- ---------------------------------------------------------------------------

create function public.enqueue_auto_publish_job(
  p_draft_id   uuid,
  p_account_id uuid,
  p_rule       text default 'auto_within_rules'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft public.content_drafts;
  ws public.workspaces;
  account public.connected_accounts;
  limits record;
  local_ts timestamp;
  idea_confidence integer;
  violations text[] := '{}';
  reason text;
  used integer;
  job_id uuid;
  check_result jsonb;
  actor text := 'rule:' || p_rule;
begin
  select * into draft from public.content_drafts where id = p_draft_id for update;
  if draft.id is null then
    return jsonb_build_object('job_id', null, 'held', 'draft not found', 'route_to_review', false);
  end if;

  -- Same lock as claim_publish_job(), so the cap check below cannot race execution.
  perform pg_advisory_xact_lock(hashtextextended('publish-cap:' || draft.workspace_id::text, 0));

  select * into ws from public.workspaces where id = draft.workspace_id;
  select * into account from public.connected_accounts where id = p_account_id;
  select * into limits from public.plan_limits(ws.plan);
  local_ts := now() at time zone ws.timezone;

  if draft.strategy_idea_id is not null then
    select confidence into idea_confidence from public.strategy_ideas where id = draft.strategy_idea_id;
  end if;

  if ws.publish_mode <> 'auto_within_rules' then
    reason := 'the workspace is not in auto_within_rules mode';
  elsif not limits.auto_allowed then
    reason := format('auto publishing is not included in the %s plan', ws.plan);
  elsif not ws.auto_enabled then
    reason := 'the master auto toggle is off';
  elsif draft.status <> 'awaiting_approval' then
    reason := format('only content drafts awaiting approval auto-publish (status: %s)', draft.status);
  elsif account.id is null or account.workspace_id <> draft.workspace_id
        or account.revoked_at is not null or account.status <> 'active' then
    reason := 'the target account is not connected or its token is invalid';
  elsif lower(account.platform) <> lower(trim(draft.platform)) then
    reason := 'the account is for a different platform';
  elsif not account.auto_enabled then
    reason := 'the target account is not enabled for auto publishing';
  elsif not public.has_approved_claims(ws.id) then
    reason := 'the workspace has no approved claims';
  else
    violations := public.forbidden_claims_in(ws.id, public.payload_text(draft.payload_json));

    if cardinality(violations) > 0 then
      update public.content_drafts
      set auto_review_reason = format('forbidden claims: %s', array_to_string(violations, ', '))
      where id = draft.id;

      perform public.write_audit_system(
        ws.id, 'auto.routed_to_review', 'content_draft', draft.id,
        jsonb_build_object('rule', p_rule, 'violations', to_jsonb(violations), 'account_id', account.id)
      );
      return jsonb_build_object(
        'job_id', null,
        'held', format('the body contains forbidden claims: %s', array_to_string(violations, ', ')),
        'route_to_review', true
      );
    end if;

    if not (extract(isodow from local_ts)::smallint = any(ws.auto_days)
            and local_ts::time >= ws.auto_window_start
            and local_ts::time < ws.auto_window_end) then
      reason := 'outside the auto publishing window';
    elsif ws.auto_min_confidence is not null
          and (idea_confidence is null or idea_confidence < ws.auto_min_confidence) then
      reason := format('the linked idea''s confidence is below %s', ws.auto_min_confidence);
    else
      -- Counts executed publishes today plus queued ones not yet executed, so
      -- auto never approves more drafts than the cap could let through.
      select count(*) into used
      from public.publish_jobs
      where workspace_id = ws.id
        and ((cap_counted and executed_on = (now() at time zone 'utc')::date)
             or (status = 'queued' and not cap_counted));

      if used >= ws.daily_publish_cap then
        reason := format('daily publish cap reached (%s of %s)', used, ws.daily_publish_cap);
        perform public.write_audit_system(
          ws.id, 'auto.cap_refused', 'content_draft', draft.id,
          jsonb_build_object('rule', p_rule, 'used', used, 'cap', ws.daily_publish_cap)
        );
      end if;
    end if;
  end if;

  if reason is not null then
    return jsonb_build_object('job_id', null, 'held', reason, 'route_to_review', false);
  end if;

  check_result := jsonb_build_object('passed', true, 'violations', '[]'::jsonb, 'checked_at', now());

  update public.content_drafts set status = 'approved' where id = draft.id;

  insert into public.approvals (workspace_id, target_type, target_id, status, reviewer_id, decided_by_rule, notes)
  values (ws.id, 'content_draft', draft.id, 'approved', null, p_rule,
          'Approved automatically within the workspace''s auto publishing rules.');

  perform public.write_audit_system(ws.id, 'approval.approved', 'content_draft', draft.id,
                                    jsonb_build_object('rule', p_rule, 'actor', actor));

  insert into public.publish_jobs (
    workspace_id, draft_id, connected_account_id, platform, mode, actor,
    claim_check, body_snapshot, scheduled_for, status
  )
  values (ws.id, draft.id, account.id, account.platform, ws.publish_mode, actor,
          check_result, draft.payload_json, now(), 'queued')
  returning id into job_id;

  perform public.write_audit_system(
    ws.id, 'publish.enqueued', 'publish_job', job_id,
    jsonb_build_object('draft_id', draft.id, 'account_id', account.id, 'platform', account.platform,
                       'mode', ws.publish_mode, 'actor', actor, 'claim_check', check_result)
  );

  return jsonb_build_object('job_id', job_id, 'held', null, 'route_to_review', false);
end;
$$;

/** Drafts that could auto-publish, each with one auto-enabled account. Service role only. */
create function public.auto_publish_candidates(p_limit integer default 20, p_workspace uuid default null)
returns table (draft_id uuid, account_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (d.id) d.id, a.id
  from public.content_drafts d
  join public.workspaces w on w.id = d.workspace_id
  join public.connected_accounts a
    on a.workspace_id = d.workspace_id
   and a.platform = lower(trim(d.platform))
   and a.auto_enabled
   and a.status = 'active'
   and a.revoked_at is null
  where d.status = 'awaiting_approval'
    and d.auto_review_reason is null
    and w.publish_mode = 'auto_within_rules'
    and w.auto_enabled
    and (select l.auto_allowed from public.plan_limits(w.plan) l)
    and (p_workspace is null or d.workspace_id = p_workspace)
    and not exists (
      select 1 from public.publish_jobs j
      where j.draft_id = d.id and j.connected_account_id = a.id
        and j.status in ('scheduled', 'queued', 'publishing', 'published', 'blocked')
    )
  order by d.id, a.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- Team controls
-- ---------------------------------------------------------------------------

/**
 * Spec edge case: the last owner of a workspace cannot be removed or demoted
 * from the app. Enforced for signed-in callers only, so workspace deletion,
 * account deletion, and admin scripts still work.
 */
create function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.memberships m
       where m.workspace_id = old.workspace_id and m.role = 'owner' and m.id <> old.id
     ) then
    raise exception 'a workspace must keep at least one owner' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_last_owner
  before update of role or delete on public.memberships
  for each row execute function public.protect_last_owner();

/** Adds the plan's seat limit (decisions §6) to invitation redemption. Otherwise unchanged from 0001. */
create or replace function public.accept_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  caller_email text;
  seat_limit integer;
  seats integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select email into caller_email from public.profiles where id = auth.uid();

  select * into invite
  from public.invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if invite.id is null then
    raise exception 'invitation not found, already accepted, or expired';
  end if;

  if lower(invite.email) <> lower(caller_email) then
    raise exception 'invitation is addressed to a different account';
  end if;

  -- Serialise redemptions per workspace so two invitees cannot both take the last seat.
  perform pg_advisory_xact_lock(hashtextextended('seats:' || invite.workspace_id::text, 0));

  select l.max_seats into seat_limit
  from public.workspaces w cross join lateral public.plan_limits(w.plan) l
  where w.id = invite.workspace_id;

  select count(*) into seats from public.memberships where workspace_id = invite.workspace_id;

  if seats >= seat_limit and not exists (
    select 1 from public.memberships where workspace_id = invite.workspace_id and user_id = auth.uid()
  ) then
    raise exception 'this workspace has reached its seat limit (% of % on its plan)', seats, seat_limit;
  end if;

  insert into public.memberships (user_id, workspace_id, role)
  values (auth.uid(), invite.workspace_id, invite.role)
  on conflict (user_id, workspace_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invite.id;

  return invite.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.enqueue_auto_publish_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.auto_publish_candidates(integer, uuid) from public, anon, authenticated;
revoke all on function public.protect_last_owner() from public, anon, authenticated;
