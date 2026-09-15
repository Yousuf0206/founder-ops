-- Lumo-Ops v2 — Phase 4: lead tasks, metrics, learn summaries, knowledge proposals
-- Tasks (specs/002-growth-platform-core/tasks.md): T4.2, T4.3, T4.4, T4.5, T4.7
-- Spec: US6, US9 AC4, FR-LRN-001..004, FR-P-010b

-- ---------------------------------------------------------------------------
-- lead_tasks — "contact manually" and the team's own notes (US9 AC4, FR-L-004)
-- ---------------------------------------------------------------------------

create table public.lead_tasks (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  note         text not null check (length(trim(note)) between 1 and 2000),
  done         boolean not null default false,
  done_at      timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index lead_tasks_lead_idx on public.lead_tasks (lead_id, created_at desc);
create index lead_tasks_workspace_open_idx on public.lead_tasks (workspace_id) where not done;

-- ---------------------------------------------------------------------------
-- performance_snapshots — metrics, or a stated absence (FR-LRN-001, SC-004)
-- ---------------------------------------------------------------------------

create table public.performance_snapshots (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  id             uuid primary key default gen_random_uuid(),
  publish_job_id uuid not null references public.publish_jobs (id) on delete cascade,
  -- US6 AC2: when a connector exposes nothing, say so rather than estimate.
  available      boolean not null,
  metrics        jsonb not null default '{}'::jsonb,
  note           text not null default '',
  fetched_at     timestamptz not null default now()
);

create index performance_snapshots_job_idx on public.performance_snapshots (publish_job_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- learn_summaries — "what worked" and next topics, tied to evidence (FR-LRN-002/003)
-- ---------------------------------------------------------------------------

create table public.learn_summaries (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  id               uuid primary key default gen_random_uuid(),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  what_worked      jsonb not null default '[]'::jsonb,
  suggested_topics jsonb not null default '[]'::jsonb,
  evidence_job_ids uuid[] not null default '{}',
  run_id           uuid references public.ai_run_logs (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint learn_summaries_period_check check (period_start <= period_end)
);

create index learn_summaries_workspace_created_idx on public.learn_summaries (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- knowledge_proposals — edits that change nothing until a human accepts (FR-LRN-004)
-- ---------------------------------------------------------------------------

create table public.knowledge_proposals (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  id               uuid primary key default gen_random_uuid(),
  summary_id       uuid references public.learn_summaries (id) on delete set null,
  kind             text not null check (kind in ('approved_claim_add', 'forbidden_claim_add')),
  proposed_text    text not null check (length(trim(proposed_text)) between 1 and 500),
  rationale        text not null default '',
  evidence_job_ids uuid[] not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index knowledge_proposals_workspace_pending_idx
  on public.knowledge_proposals (workspace_id, created_at desc) where status = 'pending';

/** US6 AC5: the knowledge base changes only on accept; both outcomes are audited. */
create function public.decide_knowledge_proposal(p_proposal_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.knowledge_proposals;
  claim text;
begin
  select * into proposal from public.knowledge_proposals where id = p_proposal_id for update;
  if proposal.id is null then
    raise exception 'proposal not found';
  end if;
  if not public.can_write(proposal.workspace_id) then
    raise exception 'viewers cannot change the knowledge base' using errcode = '42501';
  end if;
  if proposal.status <> 'pending' then
    raise exception 'this proposal has already been decided (%)', proposal.status;
  end if;

  if p_accept then
    claim := trim(proposal.proposed_text);

    insert into public.claim_sets (workspace_id, approved_claims, forbidden_claims, brand_voice)
    values (proposal.workspace_id, '{}', '{}', '')
    on conflict (workspace_id) do nothing;

    if proposal.kind = 'approved_claim_add' then
      update public.claim_sets
      set approved_claims = array_append(approved_claims, claim), updated_by = auth.uid()
      where workspace_id = proposal.workspace_id and not (claim = any(approved_claims));
    else
      update public.claim_sets
      set forbidden_claims = array_append(forbidden_claims, claim), updated_by = auth.uid()
      where workspace_id = proposal.workspace_id and not (claim = any(forbidden_claims));
    end if;
  end if;

  update public.knowledge_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      decided_by = auth.uid(),
      decided_at = now()
  where id = proposal.id;

  perform public.write_audit(
    proposal.workspace_id,
    case when p_accept then 'knowledge.proposal_accepted' else 'knowledge.proposal_rejected' end,
    'knowledge_proposal', proposal.id,
    jsonb_build_object('kind', proposal.kind, 'text', proposal.proposed_text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- FR-P-010b: a forbidden claim added AFTER a post shipped raises an audit flag.
-- The live post is never silently rewritten or retracted.
-- ---------------------------------------------------------------------------

create function public.flag_published_forbidden_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added text[];
  job record;
  claim text;
begin
  select coalesce(array_agg(trim(c)), '{}') into added
  from unnest(new.forbidden_claims) as c
  where length(trim(c)) > 0 and not (c = any(coalesce(old.forbidden_claims, '{}')));

  if cardinality(added) = 0 then
    return new;
  end if;

  for job in
    select j.id, j.body_snapshot from public.publish_jobs j
    where j.workspace_id = new.workspace_id and j.status = 'published'
  loop
    foreach claim in array added loop
      if position(lower(claim) in lower(public.payload_text(job.body_snapshot))) > 0 then
        insert into public.audit_logs (workspace_id, actor, action, target_type, target_id, meta)
        values (new.workspace_id, auth.uid(), 'publish.forbidden_claim_found_after_publish',
                'publish_job', job.id,
                jsonb_build_object('claim', claim,
                                   'note', 'The live post was not changed. Review it on the platform.'));
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger claim_sets_flag_published_posts
  after update of forbidden_claims on public.claim_sets
  for each row execute function public.flag_published_forbidden_claims();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.lead_tasks            enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.learn_summaries       enable row level security;
alter table public.knowledge_proposals   enable row level security;

alter table public.lead_tasks            force row level security;
alter table public.performance_snapshots force row level security;
alter table public.learn_summaries       force row level security;
alter table public.knowledge_proposals   force row level security;

create policy lead_tasks_select_member on public.lead_tasks
  for select to authenticated using (public.is_member(workspace_id));

create policy lead_tasks_insert_writer on public.lead_tasks
  for insert to authenticated
  with check (
    public.can_write(workspace_id)
    and exists (select 1 from public.leads l where l.id = lead_id and l.workspace_id = lead_tasks.workspace_id)
  );

create policy lead_tasks_update_writer on public.lead_tasks
  for update to authenticated
  using (public.can_write(workspace_id)) with check (public.can_write(workspace_id));

create policy lead_tasks_delete_writer on public.lead_tasks
  for delete to authenticated using (public.can_write(workspace_id));

-- Snapshots are written by the server (service role) only.
create policy performance_snapshots_select_member on public.performance_snapshots
  for select to authenticated using (public.is_member(workspace_id));

create policy learn_summaries_select_member on public.learn_summaries
  for select to authenticated using (public.is_member(workspace_id));

create policy learn_summaries_insert_writer on public.learn_summaries
  for insert to authenticated with check (public.can_write(workspace_id));

create policy knowledge_proposals_select_member on public.knowledge_proposals
  for select to authenticated using (public.is_member(workspace_id));

-- Born pending; decided only through decide_knowledge_proposal().
create policy knowledge_proposals_insert_writer on public.knowledge_proposals
  for insert to authenticated
  with check (public.can_write(workspace_id) and status = 'pending' and decided_by is null);

revoke all on public.lead_tasks, public.performance_snapshots, public.learn_summaries,
  public.knowledge_proposals from anon, authenticated;

grant select, insert, update, delete on public.lead_tasks to authenticated;
grant select on public.performance_snapshots to authenticated;
grant select, insert on public.learn_summaries to authenticated;
grant select, insert on public.knowledge_proposals to authenticated;

revoke all on function public.decide_knowledge_proposal(uuid, boolean) from public, anon;
grant execute on function public.decide_knowledge_proposal(uuid, boolean) to authenticated;
revoke all on function public.flag_published_forbidden_claims() from public, anon, authenticated;
