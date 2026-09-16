-- Lumo Grow v3 — Phase A: Growth Instant front door
-- Tasks (specs/003-growth-instant/tasks.md): T-A9, T-A10
-- Spec: FR-GI-S-002 (goal), FR-GI-H-001/002 (hurdles), FR-GI-X-001/002 (product facts)

-- ---------------------------------------------------------------------------
-- analyze_runs — carry the Growth Instant goal and hurdle list
--
-- The v2 columns (themes, content_gaps, claim_risks, statements, unknowns) stay
-- as they are: the v2 analyze screen still reads them. Growth Instant writes the
-- same row and adds its own two columns, so one analysis serves both surfaces
-- rather than forking the table.
-- ---------------------------------------------------------------------------

alter table public.analyze_runs
  add column if not exists goal text
    check (goal is null or goal in ('signups', 'awareness', 'waitlist', 'other')),
  -- FR-GI-H-001: 3–7 hurdles. Shape is enforced in the application (zod), not
  -- here: a malformed model response must fail the run, not the insert.
  add column if not exists hurdles jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- product_facts — what the public page says the product is
--
-- Constitution I (amended v3.0.0): the knowledge base may be SEEDED by
-- extraction, and remains the single source of product claims. Auto-extracted
-- facts are unconfirmed until a human edits or confirms them, which is what
-- `confirmed_at` records.
--
-- Scope is per WORKSPACE, not per analyze_run: facts describe the product, and
-- a second analysis of the same product must refine them rather than fork a
-- rival set. `source_analyze_run_id` keeps provenance without splitting scope.
-- (Open decision 3 in plan.md — revisit if the workspace-select rule changes.)
-- ---------------------------------------------------------------------------

create table public.product_facts (
  workspace_id          uuid primary key
                          references public.workspaces (id) on delete cascade,
  product_name          text not null default '',
  tagline               text not null default '',
  -- [{ "feature": "...", "evidence": "..." }] — evidence is the page's own words.
  features              jsonb not null default '[]'::jsonb,
  primary_cta           text not null default '',
  pricing_signals       jsonb not null default '[]'::jsonb,
  -- FR-GI-X-005 / Constitution II: what the page did not say, kept explicit so
  -- generation can state unknowns instead of inventing them.
  unknowns              jsonb not null default '[]'::jsonb,
  source_url            text not null default '',
  source_analyze_run_id uuid references public.analyze_runs (id) on delete set null,
  -- null = auto-extracted and unconfirmed. Set when a human edits at Advanced.
  confirmed_at          timestamptz,
  updated_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.product_facts enable row level security;

-- Constitution VII: isolation is not a UI concern.
create policy product_facts_select_member on public.product_facts
  for select
  using (public.is_member(workspace_id));

create policy product_facts_insert_writer on public.product_facts
  for insert
  with check (public.can_write(workspace_id));

create policy product_facts_update_writer on public.product_facts
  for update
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

create policy product_facts_delete_writer on public.product_facts
  for delete
  using (public.can_write(workspace_id));
