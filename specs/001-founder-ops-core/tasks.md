---
description: "Task list for Founder Ops Core implementation"
---

# Tasks: Founder Ops Core

**Input**: `specs/001-founder-ops-core/spec.md`, `specs/001-founder-ops-core/plan.md`
**Prerequisites**: plan.md (required), spec.md (required for user stories)
**Governed by**: `.specify/memory/constitution.md` (Founder Ops Constitution v1.0.0)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on a sibling task
- **[Story]**: the spec.md user story this serves (US1–US6), or `SYS` for cross-cutting
- Paths follow the plan's structure decision: single Next.js app at repository root

Tasks marked **➕** were not in Tasks v1.0. Each is listed with its reason in
[Added tasks and why](#added-tasks-and-why) — they close a gap between the task list and
a requirement already agreed in spec.md, plan.md, or the constitution.

---

## Phase 0 — Foundation

**Goal**: A signed-in owner reaches an empty Home; a stranger cannot reach anything.
**Status**: code complete, **not yet verified against a running database** — see
[Phase 0 verification gap](#phase-0-verification-gap).

- [X] **T0.1** [P] [SYS] Create app shell — Next.js 15 App Router, TS strict, Tailwind, at repo root
- [X] **T0.2** [P] [SYS] Env template `env.example` (URL, anon key, service-role key server-only) — *creating the hosted Supabase project is a user action, not done here*
- [X] **T0.3** [US1] Migration: `workspaces`, `profiles`, `memberships` — `supabase/migrations/0001_foundation.sql`
- [X] **T0.4** [US1] RLS policies for membership-scoped access — same migration file as T0.3
- [X] **T0.5** [US1] Auth UI (`app/(auth)/login/`) + session helper `lib/auth/session.ts`
- [X] **T0.6** [US1] Workspace bootstrap script — `supabase/seed/seed-workspace.ts`
- [X] **T0.7** [US1] Ops layout gate in `app/(ops)/layout.tsx` — no membership → access denied
- [X] **T0.8** [P] [US1] Home placeholder + nav (Knowledge, Research, Content, Approvals, Settings)
- [X] **T0.9** ➕ [US1] RLS integration test — `tests/integration/rls-foundation.test.ts`, 13 cases — **written, never executed**
- [X] **T0.10** ➕ [US1] Invitation join path — `invitations` table + `accept_invitation()` + `/invite/[token]`
- [X] **T0.11** ➕ [P] [SYS] CI guard `scripts/check-public-env.mjs` — passing
- [X] **T0.12** ➕ [P] [SYS] Vitest setup + local Supabase test harness — `tests/helpers/supabase.ts`

**DoD:** Owner can log in and see empty Home; stranger cannot. RLS proven by test, not by inspection.
**DoD status:** unmet — the proof requires running the tests (below).

### Phase 0 verification gap

What passed here: `npm run typecheck` (clean), `npm run build` (7 routes + middleware),
`npm run check:public-env` (clean).

What has **not** run: the migration has never been applied to any database, and all 13
RLS tests reported `skipped` because `TEST_SUPABASE_*` is unset. Every RLS claim in this
phase is therefore reviewed, not proven.

To close it:

1. Create a Supabase project (or `supabase start` locally)
2. `cp env.example .env.local` and fill in the keys
3. Apply `supabase/migrations/0001_foundation.sql`
4. Sign in once at `/login` to create your profile row
5. `npm run seed:workspace -- --name "Lumo Learn" --slug lumo --owner <your-email>`
6. `npm test` — 13 tests must pass, not skip

---

## Phase 1 — Knowledge

**Goal**: The workspace's product truth is editable and stored, scoped to the workspace.

- [ ] **T1.1** [US1] Migration: `knowledge_docs`, `claim_sets` + their RLS policies (same file)
- [ ] **T1.2** [US1] API CRUD `knowledge_docs` under `app/api/ops/knowledge/`
- [ ] **T1.3** [P] [US1] UI: list / create / edit docs — `app/(ops)/knowledge/`
- [ ] **T1.4** [P] [US1] UI: approved claims + forbidden claims + brand voice editor
- [ ] **T1.5** [US1] Seed Lumo starter claims (no rank guarantees, etc.) — `supabase/seed/`
- [ ] **T1.6** ➕ [US1] Zod schemas at the knowledge API boundary (validate before write)
- [ ] **T1.7** ➕ [US1] Role gate: viewers read, editors and owners write (extends T0.4 policies)

**DoD:** Claims editable and stored per workspace; viewer cannot write.

---

## Phase 2 — Research

**Goal**: A real research report is saved under Lumo, with labelled findings, logged and capped.

- [ ] **T2.1** [US2] Migration: `research_reports`, `ai_run_logs`, `audit_logs` + RLS policies
- [ ] **T2.2** [US2] `lib/ai/` provider client (env-selected) + run cap check
- [ ] **T2.3** [US2] `lib/prompts/assemble.ts` — inject brand voice, approved claims, forbidden claims, and the "if unknown, say unknown" instruction; **claim set is a required argument, throw if absent**
- [ ] **T2.4** [US2] `POST /api/ops/research/run`
- [ ] **T2.5** [P] [US2] Research UI: input → result with Fact / Inference / Hypothesis
- [ ] **T2.6** [US2] Persist report + log tokens/run into `ai_run_logs`
- [ ] **T2.7** ➕ [SYS] Cap configuration storage per FR-Q-002 resolution — cap must read from data, not a constant
- [ ] **T2.8** ➕ [SYS] Cap enforcement is transactional — check and increment in one transaction so concurrent runs cannot both pass at the boundary
- [ ] **T2.9** ➕ [US2] Unit test: prompt assembly throws when the claim set is missing
- [ ] **T2.10** ➕ [US2] Integration test: run at the cap boundary is refused and makes no provider call
- [ ] **T2.11** ➕ [US2] Failure path: provider timeout / error / unparseable output logs a failed run and saves no partial report

**DoD:** One real report saved under Lumo workspace; cap enforced under concurrency; every run logged.

---

## Phase 3 — Content + Approvals

**Goal**: Draft → human decision works end to end, and nothing publishes itself.

- [ ] **T3.1** [US3] Migration: `content_drafts`, `approvals` + RLS policies
- [ ] **T3.2** [US3] `POST /api/ops/content/run` → status `awaiting_approval`
- [ ] **T3.3** [P] [US3] Content list + detail UI — `app/(ops)/content/`
- [ ] **T3.4** [P] [US4] Approvals inbox UI — `app/(ops)/approvals/`
- [ ] **T3.5** [US4] `POST /api/ops/approvals/:id/decision` — approve | reject | edit-and-approve
- [ ] **T3.6** [US4] Manual "mark published" action (status transition only, no outbound call)
- [ ] **T3.7** ➕ [US4] Write an `audit_logs` row in the same transaction as every approval decision
- [ ] **T3.8** ➕ [US4] Approval authority gate per FR-Q-001 resolution
- [ ] **T3.9** ➕ [US4] Edit-and-approve retains both the model's original payload and the edited one in the audit trail
- [ ] **T3.10** ➕ [SYS] CI guard: no social/publish SDK in `package.json` (Constitution I, SC-007)
- [ ] **T3.11** ➕ [US3] Integration test: forbidden claim in the workspace does not appear in approved output (SC-005)

**DoD:** Draft → approve path works end-to-end; no auto-publish; every decision audited.

---

## Phase 4 — Leads

**Goal**: Inbound leads land, get classified from workspace knowledge, and alert the owner.
**Blocked by**: FR-Q-003 and FR-Q-004.

- [ ] **T4.1** [US5] Migration: `leads` + RLS policies
- [ ] **T4.2** [US5] `POST /api/ops/leads/ingest` — API key or signed secret per workspace
- [ ] **T4.3** [US5] Classify segment / intent via LLM using knowledge base only
- [ ] **T4.4** [US5] Email notify owner on high intent — `lib/email/` (Resend)
- [ ] **T4.5** [P] [US5] Leads UI list / detail
- [ ] **T4.6** ➕ [US5] Integration test: unauthenticated ingest is rejected and stores nothing
- [ ] **T4.7** ➕ [US5] Confirm no code path can email the lead — only the workspace owner (Constitution IV)
- [ ] **T4.8** ➕ [US5] Duplicate-lead handling: same email from two sources

**DoD:** Test ingest creates lead; high intent sends email to the owner and nothing to the lead.

---

## Phase 5 — Campaigns + multi-workspace proof

**Goal**: The constitution self-audit passes and the MVP is usable for Lumo.

- [ ] **T5.1** [US6] `campaigns` table + run API + UI, mirroring the content approval pipeline
- [ ] **T5.2** [SYS] Settings: AI cap, notify email — `app/(ops)/settings/`
- [ ] **T5.3** [SYS] Create second workspace (script or minimal UI)
- [ ] **T5.4** [SYS] Isolation test: workspace A cannot read B
- [ ] **T5.5** [SYS] Audit log viewer
- [ ] **T5.6** ➕ [US6] Approving a campaign containing an email draft sends no email
- [ ] **T5.7** ➕ [SYS] Run the constitution's six self-audit questions against the finished build and record the result

**DoD:** Constitution self-audit passes; core MVP usable for Lumo; second workspace isolated.

---

## Blockers before Phase 0

| Question | Blocks | Status |
|---|---|---|
| **FR-Q-007** — how does a second person join a workspace? | T0.3, T0.10 | **Answered 2026-09-11:** owner invites by email. `invitations` table (email, role, token, invited_by, expires_at, accepted_at) + `accept_invitation()`. Implemented. |
| **FR-Q-006** — who may create a workspace? | T0.3, T0.6 | **Answered 2026-09-11:** seed/admin script only. No INSERT policy on `workspaces` for authenticated users; `npm run seed:workspace` uses the service-role key. Implemented. |
| **FR-Q-002** — cap number, unit, reset boundary, adjustable? | T2.7 | **Answered 2026-09-11:** 50 runs/day, counted as runs, UTC-midnight reset, owner-editable. Column `workspaces.daily_run_cap` exists with default 50; enforcement is Phase 2. |
| **FR-Q-001** — what grants an editor approval rights? | T3.8 | Open — needed by Phase 3. |
| **FR-Q-003 / FR-Q-004** — lead score scale, high-intent threshold, segment/stage vocabulary | T4.3, T4.4 | Open — needed by Phase 4; the classifier is untestable without a fixed vocabulary. |
| **FR-Q-005** — what is Telegram for? | nothing | Open — unscoped, post-v1. |

---

## Added tasks and why

| Task | Gap it closes |
|---|---|
| T0.9 | plan.md puts RLS tests in Phase 0, but Tasks v1.0 had no test task until T5.4 in Phase 5. Isolation would be unproven through five phases of data-carrying tables. |
| T0.10 | FR-Q-007 — no task anywhere created a second membership. |
| T0.11 | Constitution IX verification named in plan.md's Constitution Check. |
| T0.12 | No task established a test runner, yet T5.4 assumes one. |
| T1.6 | Project rule: validate input at system boundaries. |
| T1.7 | Viewer/editor/owner roles are specified (US1 scenario 5) but no task enforced them. |
| T2.7 | T2.2 checks a cap; T5.2 configures it in Phase 5. Between them the cap would be a hardcoded constant — Constitution VIII calls an unenforced cap a bug. |
| T2.8 | spec.md edge case: the cap must hold under concurrency, not on a pre-check. |
| T2.9 | The mechanism plan.md relies on for Constitution III needs a test. |
| T2.10, T2.11 | spec.md acceptance scenario US2-4 and the provider-failure edge case. |
| T3.7 | FR-S-003 and SC-006 — audit on every approval; no task wrote one. |
| T3.8 | FR-Q-001. |
| T3.9 | spec.md edge case: heavy edit-and-approve must leave both versions traceable. |
| T3.10 | Constitution I verification named in plan.md; the risk table lists auto-publish scope creep as risk #1 with "constitution block" as the plan — this is that block, mechanised. |
| T3.11 | SC-005 and NFR-004: a forbidden claim in approved output is a defect, so it needs a test. |
| T4.6, T4.7 | US5 acceptance scenarios 2 and 5. |
| T4.8 | spec.md edge case: duplicate lead email. |
| T5.6 | US6 acceptance scenario 3. |
| T5.7 | The constitution's section 6 self-audit, which Phase 5's DoD asserts passes. |

---

## Explicit non-tasks (v1)

- Auto-post to Instagram / YouTube
- Cold email sequences
- Dify requirement
- Student app integration beyond an optional lead-form webhook
- Telegram (FR-Q-005 — unscoped; no requirement exists for it yet)
