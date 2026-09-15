-- Lumo-Ops v2 — Phase 1: URL analysis and scored strategy ideas
-- Tasks (specs/002-growth-platform-core/tasks.md): T1.2, T1.4, T1.6, T1.7
-- Spec: FR-O-003..005 (analyze), FR-S-001..003 (strategy), US8 AC4 (idea → assets)

-- ---------------------------------------------------------------------------
-- analyze_runs — one analysis of one public URL
-- ---------------------------------------------------------------------------

create table public.analyze_runs (
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  id              uuid primary key default gen_random_uuid(),
  source_url      text not null check (source_url ~* '^https?://' and length(source_url) <= 2000),
  status          public.run_status not null default 'running',
  page_title      text not null default '',
  fetched_bytes   integer,
  product_summary text not null default '',
  themes          jsonb not null default '[]'::jsonb,
  content_gaps    jsonb not null default '[]'::jsonb,
  claim_risks     jsonb not null default '[]'::jsonb,
  -- US1 AC5: every claim-bearing statement carries Fact | Inference | Hypothesis.
  statements      jsonb not null default '[]'::jsonb,
  unknowns        jsonb not null default '[]'::jsonb,
  error           text,
  run_id          uuid references public.ai_run_logs (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index analyze_runs_workspace_created_idx
  on public.analyze_runs (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- strategy_ideas — scored campaign ideas, always tied to evidence
-- ---------------------------------------------------------------------------

create table public.strategy_ideas (
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  id                 uuid primary key default gen_random_uuid(),
  -- FR-S-003: an idea exists only because of its evidence, so deleting the
  -- evidence deletes the idea rather than leaving an unsupported one behind.
  research_report_id uuid references public.research_reports (id) on delete cascade,
  analyze_run_id     uuid references public.analyze_runs (id) on delete cascade,
  title              text not null check (length(trim(title)) between 1 and 200),
  angle              text not null default '',
  impact             integer not null check (impact between 0 and 100),
  effort             integer not null check (effort between 0 and 100),
  confidence         integer not null check (confidence between 0 and 100),
  evidence_refs      jsonb not null
    check (jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) > 0),
  status             text not null default 'proposed'
    check (status in ('proposed', 'selected', 'discarded')),
  run_id             uuid references public.ai_run_logs (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint strategy_ideas_has_source
    check (research_report_id is not null or analyze_run_id is not null)
);

create index strategy_ideas_workspace_created_idx
  on public.strategy_ideas (workspace_id, created_at desc);

-- US8 AC4: a selected idea is the topic source for asset generation.
alter table public.content_drafts
  add column strategy_idea_id uuid references public.strategy_ideas (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row Level Security — members read; writers create and tidy up
-- ---------------------------------------------------------------------------

alter table public.analyze_runs   enable row level security;
alter table public.strategy_ideas enable row level security;

alter table public.analyze_runs   force row level security;
alter table public.strategy_ideas force row level security;

create policy analyze_runs_select_member on public.analyze_runs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy analyze_runs_insert_writer on public.analyze_runs
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy analyze_runs_delete_writer on public.analyze_runs
  for delete to authenticated
  using (public.can_write(workspace_id));

create policy strategy_ideas_select_member on public.strategy_ideas
  for select to authenticated
  using (public.is_member(workspace_id));

create policy strategy_ideas_insert_writer on public.strategy_ideas
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy strategy_ideas_update_writer on public.strategy_ideas
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

create policy strategy_ideas_delete_writer on public.strategy_ideas
  for delete to authenticated
  using (public.can_write(workspace_id));

grant select, insert, delete on public.analyze_runs to authenticated;
grant select, insert, update, delete on public.strategy_ideas to authenticated;
