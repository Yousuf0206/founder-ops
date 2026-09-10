---
id: 0004
title: Founder Ops Tasks v1
stage: tasks
date: 2026-09-11
surface: claude-code-cli
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: /speckit.tasks
labels: [tasks, founder-ops, phases, backlog]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/001-founder-ops-core/tasks.md
tests:
  - (none)
---

## Prompt

## `/speckit.tasks`

# Founder Ops — Tasks v1.0

## Phase 0 — Foundation
- [ ] T0.1 Create app shell (Next.js + Tailwind + TS strict)
- [ ] T0.2 Supabase project + env template (URL, anon, service role server-only)
- [ ] T0.3 Migration: workspaces, profiles, memberships
- [ ] T0.4 RLS policies for membership-scoped access
- [ ] T0.5 Auth UI (login) + session helper
- [ ] T0.6 Bootstrap workspace "Lumo Learn" + owner membership (seed script)
- [ ] T0.7 Ops layout gate: no membership -> access denied
- [ ] T0.8 Home placeholder + nav (Knowledge, Research, Content, Approvals, Settings)
**DoD:** Owner can log in and see empty Home; stranger cannot.

## Phase 1 — Knowledge
- [ ] T1.1 Migration: knowledge_docs, claim_sets
- [ ] T1.2 API CRUD knowledge_docs
- [ ] T1.3 UI: list/create/edit docs
- [ ] T1.4 UI: approved + forbidden claims + brand voice editor
- [ ] T1.5 Seed Lumo starter claims (no rank guarantees, etc.)
**DoD:** Claims editable and stored per workspace.

## Phase 2 — Research
- [ ] T2.1 Migration: research_reports, ai_run_logs, audit_logs
- [ ] T2.2 lib/ai client + run cap check
- [ ] T2.3 Prompt builder (inject claims + voice)
- [ ] T2.4 POST /api/ops/research/run
- [ ] T2.5 Research UI: input -> result with Fact/Inference/Hypothesis
- [ ] T2.6 Persist report + log tokens/run
**DoD:** One real report saved under Lumo workspace; cap enforced.

## Phase 3 — Content + Approvals
- [ ] T3.1 Migration: content_drafts, approvals
- [ ] T3.2 POST /api/ops/content/run -> status awaiting_approval
- [ ] T3.3 Content list + detail UI
- [ ] T3.4 Approvals inbox UI
- [ ] T3.5 POST decision approve|reject|edit
- [ ] T3.6 Manual "mark published" action
**DoD:** Draft -> approve path works end-to-end; no auto-publish.

## Phase 4 — Leads
- [ ] T4.1 Migration: leads
- [ ] T4.2 POST /api/ops/leads/ingest (API key or signed secret per workspace)
- [ ] T4.3 Classify segment/intent via LLM + knowledge only
- [ ] T4.4 Email notify on high intent
- [ ] T4.5 Leads UI list/detail
**DoD:** Test ingest creates lead; high intent sends email.

## Phase 5 — Campaigns + multi-workspace proof
- [ ] T5.1 campaigns table + run API + UI (mirrors content approval)
- [ ] T5.2 Settings: AI cap, notify email
- [ ] T5.3 Create second workspace (script or minimal UI)
- [ ] T5.4 Isolation test: workspace A cannot read B
- [ ] T5.5 Audit log viewer
**DoD:** Constitution self-audit passes; core MVP usable for Lumo.

## Explicit non-tasks (v1)
- Auto-post to Instagram/YouTube
- Cold email sequences
- Dify requirement
- Student app integration beyond optional lead form webhook

## Response snapshot

Wrote `specs/001-founder-ops-core/tasks.md`. Kept all 29 original tasks with their IDs and
phase structure intact, adding `[P]` parallel markers, US1-US6 story tags, and concrete
file paths per the plan's structure decision. Added 24 tasks marked with a plus glyph,
each justified in an "Added tasks and why" table that cites the spec requirement,
constitution principle, or edge case it closes. The largest gap: Tasks v1.0 had no test
task before T5.4 in Phase 5, while plan.md places RLS tests in Phase 0 - meaning isolation
would go unproven through five phases of data-carrying tables. Second largest: T2.2 checks
a cap whose value nothing stores until T5.2 in Phase 5. Added a Blockers table keying
FR-Q-001..007 to the specific task IDs they gate. Telegram added to explicit non-tasks.

## Outcome

- Impact: Backlog is now traceable to spec requirements and constitution principles; blockers are keyed to task IDs.
- Tests: none run (tasks stage); 9 test tasks now exist in the backlog where 1 did
- Files: `specs/001-founder-ops-core/tasks.md` (new)
- Next prompts: answer FR-Q-006 and FR-Q-007, then start T0.1.
- Reflection: The gap pattern across all three documents is the same - safety properties are asserted in prose (constitution, DoD lines) without a corresponding mechanism or test task. The added tasks are mostly mechanisation of claims already made.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): every spec.md SC-001..007 now maps to at least one task
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
