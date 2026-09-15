-- Lumo-Ops v2 — Phase 0: plans (entitlements as config) and workspace settings
-- Tasks (specs/002-growth-platform-core/tasks.md): T0.9, T1.1 (creation under plan limit)
-- Decisions: decisions-2026-09-15.md §4 (modes, auto window), §5 (publish cap), §6 (plans)
--
-- Plan D5: settings extend `workspaces` rather than living in a second table.
-- Entitlements are a function, not a table: they are product config shared by
-- every tenant, and Constitution VII puts workspace_id on every tenant table.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.plan_tier as enum ('solo', 'team', 'business');

-- Constitution IV: exactly one mode per workspace, never null.
create type public.publish_mode as enum ('draft_only', 'approve_then_publish', 'auto_within_rules');

-- ---------------------------------------------------------------------------
-- Entitlements — mirrored in lib/plans/entitlements.ts for display
-- ---------------------------------------------------------------------------

create function public.plan_limits(tier public.plan_tier)
returns table (
  max_workspaces  integer,
  max_seats       integer,
  daily_ai_runs   integer,
  daily_publishes integer,
  auto_allowed    boolean
)
language sql
immutable
set search_path = public
as $$
  select p.max_workspaces, p.max_seats, p.daily_ai_runs, p.daily_publishes, p.auto_allowed
  from (values
    ('solo'::public.plan_tier,      1,  3,  50,  5, false),
    ('team'::public.plan_tier,      5, 15, 150, 15, true),
    ('business'::public.plan_tier, 20, 50, 500, 50, true)
  ) as p (tier, max_workspaces, max_seats, daily_ai_runs, daily_publishes, auto_allowed)
  where p.tier = plan_limits.tier;
$$;

-- Decisions §5 clamps the owner-editable cap to 1–30; §6 gives business 50.
-- Until FR-Q-109 is decided the ceiling is min(30, plan limit), as spec.md states.
create function public.publish_cap_ceiling(tier public.plan_tier)
returns integer
language sql
immutable
set search_path = public
as $$
  select least(30, (select l.daily_publishes from public.plan_limits(tier) l));
$$;

-- ---------------------------------------------------------------------------
-- workspaces — new columns
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column plan              public.plan_tier not null default 'solo',
  add column niche             text not null default '' check (length(niche) <= 200),
  add column primary_url       text check (primary_url is null or primary_url ~* '^https?://'),
  add column goals             text not null default '' check (length(goals) <= 2000),
  add column tone              text not null default '' check (length(tone) <= 200),
  add column timezone          text not null default 'UTC',
  add column publish_mode      public.publish_mode not null default 'approve_then_publish',
  add column daily_publish_cap integer not null default 5 check (daily_publish_cap >= 1),
  add column auto_enabled      boolean not null default false,
  add column auto_window_start time not null default '09:00',
  add column auto_window_end   time not null default '20:00',
  -- ISO day numbers, 1 = Monday … 7 = Sunday. Default Mon–Sat (decisions §4).
  add column auto_days         smallint[] not null default '{1,2,3,4,5,6}',
  add constraint workspaces_auto_window_check
    check (auto_window_start < auto_window_end),
  add constraint workspaces_auto_days_check
    check (auto_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(auto_days) between 1 and 7);

-- ---------------------------------------------------------------------------
-- Settings rules the database enforces, whoever writes the row
--
-- Only the owner can UPDATE a workspace at all (workspaces_update_owner, 0001),
-- so these checks are about WHAT an owner may set. Each rule fires only when its
-- column changes, so an unrelated update (e.g. rotating the ingest secret) never
-- trips over a limit that was lowered later.
-- ---------------------------------------------------------------------------

create function public.enforce_workspace_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  limits record;
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
  is_insert boolean := tg_op = 'INSERT';
begin
  select * into limits from public.plan_limits(new.plan);

  -- Plans are assigned by seed, admin script, or DEFAULT_PLAN (decisions §6).
  if not is_insert and new.plan is distinct from old.plan and not is_service then
    raise exception 'the plan is assigned by an administrator and cannot be changed here'
      using errcode = '42501';
  end if;

  if (is_insert or new.timezone is distinct from old.timezone)
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone: %', new.timezone using errcode = '22023';
  end if;

  if new.publish_mode = 'auto_within_rules' and not limits.auto_allowed
     and (is_insert or new.publish_mode is distinct from old.publish_mode
          or new.plan is distinct from old.plan) then
    raise exception 'auto_within_rules requires the team or business plan (this workspace is on %)',
      new.plan using errcode = '42501';
  end if;

  if (is_insert or new.daily_publish_cap is distinct from old.daily_publish_cap)
     and new.daily_publish_cap > public.publish_cap_ceiling(new.plan) then
    raise exception 'daily publish cap must be between 1 and % on the % plan',
      public.publish_cap_ceiling(new.plan), new.plan using errcode = '22023';
  end if;

  -- v1 let an owner raise the AI cap to 10,000, which would bypass the plan.
  if (is_insert or new.daily_run_cap is distinct from old.daily_run_cap)
     and new.daily_run_cap > limits.daily_ai_runs and not is_service then
    raise exception 'daily AI run cap must be at most % on the % plan',
      limits.daily_ai_runs, new.plan using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger workspaces_enforce_settings
  before insert or update on public.workspaces
  for each row execute function public.enforce_workspace_settings();

-- ---------------------------------------------------------------------------
-- create_workspace_with_owner() — self-serve creation under the plan limit
--
-- FR-O-002 / US1 AC2. The workspace limit belongs to the person, so their
-- allowance is the most generous plan among workspaces they already own, or the
-- default plan when they own none. Workspace + owner membership + audit row are
-- one transaction, under a per-user advisory lock so two concurrent submissions
-- cannot both slip under the limit.
--
-- Service-role only. The server action resolves p_owner from the session and
-- p_plan from DEFAULT_PLAN; a signed-in user must never choose their own plan.
-- ---------------------------------------------------------------------------

create function public.create_workspace_with_owner(
  p_owner       uuid,
  p_name        text,
  p_slug        text,
  p_plan        public.plan_tier,
  p_niche       text default '',
  p_primary_url text default null,
  p_goals       text default '',
  p_tone        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  allowance integer;
  owned integer;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('owned-workspaces:' || p_owner::text, 0));

  select coalesce(max(l.max_workspaces), 0) into allowance
  from public.memberships m
  join public.workspaces w on w.id = m.workspace_id
  cross join lateral public.plan_limits(w.plan) l
  where m.user_id = p_owner and m.role = 'owner';

  allowance := greatest(allowance, (select l.max_workspaces from public.plan_limits(p_plan) l));

  select count(*) into owned
  from public.memberships
  where user_id = p_owner and role = 'owner';

  if owned >= allowance then
    raise exception 'workspace limit reached (% of % allowed on your plan)', owned, allowance
      using errcode = 'P0001';
  end if;

  insert into public.workspaces (name, slug, plan, niche, primary_url, goals, tone)
  values (p_name, p_slug, p_plan, coalesce(p_niche, ''), nullif(trim(p_primary_url), ''),
          coalesce(p_goals, ''), coalesce(p_tone, ''))
  returning id into new_id;

  insert into public.memberships (user_id, workspace_id, role)
  values (p_owner, new_id, 'owner');

  insert into public.audit_logs (workspace_id, actor, action, target_type, target_id, meta)
  values (new_id, p_owner, 'workspace.created', 'workspace', new_id,
          jsonb_build_object('plan', p_plan));

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.plan_limits(public.plan_tier) to authenticated;
grant execute on function public.publish_cap_ceiling(public.plan_tier) to authenticated;

revoke all on function public.create_workspace_with_owner(
  uuid, text, text, public.plan_tier, text, text, text, text
) from public, anon, authenticated;
