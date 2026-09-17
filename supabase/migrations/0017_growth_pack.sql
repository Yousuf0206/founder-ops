-- Lumo Grow v3 — Phase B: the Growth pack
-- Spec: specs/003-growth-instant (FR-GI-P-*), work order P2
--
-- One pack per "generate" from Hurdles: a set of angles, and the posts written
-- from them. The posts are content_drafts — the same table the v2 ops loop
-- uses, deliberately, so approval, the forbidden-claim check at publish time,
-- the daily cap and the publish job all apply to a pack post with no second
-- implementation and no second set of guardrails to keep in step.

-- ---------------------------------------------------------------------------
-- growth_packs
-- ---------------------------------------------------------------------------

create table public.growth_packs (
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  id              uuid primary key default gen_random_uuid(),
  -- The hurdles the pack answers. Cascade-deleting the analysis takes its pack
  -- with it: a pack with no hurdles behind it is not a thing worth keeping.
  analyze_run_id  uuid not null references public.analyze_runs (id) on delete cascade,
  -- [{ "angle": "...", "hurdle": "...", "rationale": "..." }] — shape enforced
  -- in the application (zod), as with analyze_runs.hurdles.
  angles          jsonb not null default '[]'::jsonb,
  run_id          uuid references public.ai_run_logs (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index growth_packs_workspace_created_idx
  on public.growth_packs (workspace_id, created_at desc);

create trigger growth_packs_touch_updated_at
  before update on public.growth_packs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- content_drafts — where a draft came from
--
-- `source` exists so the Pack screen can show its own posts without showing
-- every draft the ops loop ever made, and so the two can be told apart in the
-- audit trail. It defaults to 'ops' precisely so every existing row keeps its
-- current meaning.
-- ---------------------------------------------------------------------------

alter table public.content_drafts
  add column if not exists source text not null default 'ops'
    check (source in ('ops', 'growth_pack')),
  add column if not exists growth_pack_id uuid
    references public.growth_packs (id) on delete cascade;

-- A pack post must say which pack, and an ops draft must not claim one.
alter table public.content_drafts
  add constraint content_drafts_source_matches_pack
    check (
      (source = 'growth_pack' and growth_pack_id is not null) or
      (source = 'ops' and growth_pack_id is null)
    );

create index content_drafts_pack_idx
  on public.content_drafts (growth_pack_id)
  where growth_pack_id is not null;

-- ---------------------------------------------------------------------------
-- analyze_runs — the free text behind goal = 'other'
--
-- The goal is injected into the pack prompt, so "something else" has to carry
-- what that something is. Stored next to the goal it qualifies, and bounded at
-- 120 characters in the schema as well as in the form.
-- ---------------------------------------------------------------------------

alter table public.analyze_runs
  add column if not exists goal_note text not null default ''
    check (length(goal_note) <= 120);

-- ---------------------------------------------------------------------------
-- Row Level Security — members read; writers create and tidy up
-- (Constitution VII: isolation is not a UI concern.)
-- ---------------------------------------------------------------------------

alter table public.growth_packs enable row level security;
alter table public.growth_packs force row level security;

create policy growth_packs_select_member on public.growth_packs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy growth_packs_insert_writer on public.growth_packs
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy growth_packs_update_writer on public.growth_packs
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

create policy growth_packs_delete_writer on public.growth_packs
  for delete to authenticated
  using (public.can_write(workspace_id));

grant select, insert, update, delete on public.growth_packs to authenticated;
