-- Founder Ops — Phase 1 knowledge base
-- Tasks: T1.1 (tables + RLS), T1.7 (role gate: viewers read, editors/owners write)
--
-- Constitution II: one knowledge base per workspace is the only source of
-- product claims. Constitution III: the claim set binds every prompt — which is
-- why claim_sets is one row per workspace, not a free collection.

-- ---------------------------------------------------------------------------
-- knowledge_docs
-- ---------------------------------------------------------------------------

create table public.knowledge_docs (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(trim(title)) between 1 and 200),
  body             text not null default '',
  category         text not null default 'general'
                     check (length(trim(category)) between 1 and 60),
  last_verified_at timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index knowledge_docs_workspace_id_idx on public.knowledge_docs (workspace_id);
create index knowledge_docs_category_idx on public.knowledge_docs (workspace_id, category);

-- ---------------------------------------------------------------------------
-- claim_sets — exactly one per workspace
--
-- The unique constraint is the point: Constitution II says ONE knowledge base
-- per workspace is the source of product claims. Two claim sets would mean two
-- answers to "what may we say", and prompt assembly would have to choose.
-- ---------------------------------------------------------------------------

create table public.claim_sets (
  workspace_id     uuid primary key references public.workspaces (id) on delete cascade,
  approved_claims  text[] not null default '{}',
  forbidden_claims text[] not null default '{}',
  brand_voice      text not null default '',
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger knowledge_docs_touch_updated_at
  before update on public.knowledge_docs
  for each row execute function public.touch_updated_at();

create trigger claim_sets_touch_updated_at
  before update on public.claim_sets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Read: any member. Write: owners and editors only — is_member() for SELECT,
-- can_write() for INSERT/UPDATE/DELETE. Both defined in 0001_foundation.sql.
-- (US1 acceptance scenario 5: a viewer's write is rejected.)
-- ---------------------------------------------------------------------------

alter table public.knowledge_docs enable row level security;
alter table public.claim_sets     enable row level security;

alter table public.knowledge_docs force row level security;
alter table public.claim_sets     force row level security;

-- knowledge_docs ------------------------------------------------------------

create policy knowledge_docs_select_member on public.knowledge_docs
  for select to authenticated
  using (public.is_member(workspace_id));

create policy knowledge_docs_insert_writer on public.knowledge_docs
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy knowledge_docs_update_writer on public.knowledge_docs
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

create policy knowledge_docs_delete_writer on public.knowledge_docs
  for delete to authenticated
  using (public.can_write(workspace_id));

-- claim_sets ----------------------------------------------------------------

create policy claim_sets_select_member on public.claim_sets
  for select to authenticated
  using (public.is_member(workspace_id));

create policy claim_sets_insert_writer on public.claim_sets
  for insert to authenticated
  with check (public.can_write(workspace_id));

create policy claim_sets_update_writer on public.claim_sets
  for update to authenticated
  using (public.can_write(workspace_id))
  with check (public.can_write(workspace_id));

-- Deliberately no DELETE policy. A workspace without a claim set cannot
-- generate anything (Constitution III), so removing one is not an operation
-- the product offers — clearing the arrays is.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.knowledge_docs to authenticated;
grant select, insert, update on public.claim_sets to authenticated;
