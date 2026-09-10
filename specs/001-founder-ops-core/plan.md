# Implementation Plan: Founder Ops Core

**Branch**: `001-founder-ops-core` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)
**Input**: Founder Ops — Plan v1.0 (user-authored) + `specs/001-founder-ops-core/spec.md`

> HOW we build it. WHAT is in `spec.md`. Tickets in `tasks.md`.
> Governed by `.specify/memory/constitution.md` (Founder Ops Constitution v1.0.0).

## Summary

Greenfield Next.js App Router app backed by Supabase Auth + Postgres. Multi-tenancy is
enforced at the database layer: every business row carries `workspace_id`, and RLS grants
access only where a membership row exists for the calling user. All AI runs happen in
server routes against one configured provider, with the workspace claim set injected into
every system prompt and a daily run cap checked before any provider call. Nothing in the
system publishes or contacts anyone; drafts stop at `awaiting_approval` and wait for a
human.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode; Node 20 (Vercel runtime)
**Primary Dependencies**: Next.js 15 (App Router), Tailwind, `@supabase/supabase-js` + `@supabase/ssr`, Zod (boundary validation), Resend (email, Phase 4)
**Storage**: Supabase Postgres with RLS on every table
**Testing**: Vitest for unit + integration; RLS tests run against a real Postgres (local Supabase) as two distinct authenticated users
**Target Platform**: Vercel (web, server routes)
**Project Type**: Web application — single Next.js app, server routes as the backend
**Performance Goals**: p95 draft generation under 60s when the provider allows (NFR-002)
**Constraints**: No secret reaches the browser; zero cross-workspace reads; daily AI run cap per workspace
**Scale/Scope**: Internal team tool — single-digit users per workspace, two workspaces at v1 (Lumo + a smoke-test tenant), ~10 tables, ~8 screens

### Decisions taken where the plan offered options

| Open choice in Plan v1.0 | Decision | Why |
|---|---|---|
| `apps/ops/` vs `founder-ops/` | Single app at repo root (`app/`, `lib/`, `supabase/`) | One deployable, no monorepo tooling to earn its keep yet. Moving to `apps/ops/` later is a directory move, not a rewrite. Constitution X. |
| AI provider (OpenRouter / Google / etc.) | Provider chosen via env behind a single `lib/ai/provider.ts` interface; no provider SDK imported outside that module | Keeps the swap cheap and keeps keys in one server-only place. The provider identity is a deployment decision, not a code one. |
| Email (Resend vs SMTP) | Resend, introduced in Phase 4 | Nothing before Phase 4 sends email. Deferring keeps an unused dependency and an unused secret out of Phases 0–3. |
| Dify | Not used in v1 | Constitution stack default; direct server-side calls. |

## Constitution Check

*GATE: must pass before Phase 0, re-checked after each phase.*

| # | Principle | How this plan satisfies it | Verified by |
|---|---|---|---|
| I | Draft, never auto-publish | No outbound publish client exists in any layer. `published` is a status transition only. | Grep gate in CI: no social/publish SDK in `package.json`; SC-007 |
| II | One knowledge base per workspace | `knowledge_docs` + `claim_sets` keyed by `workspace_id`; no hardcoded product facts in `lib/prompts/` | Code review + prompt assembly unit test |
| III | Claims bind every prompt | Every generation path goes through `lib/prompts/assemble.ts`, which requires a `ClaimSet` argument and refuses to build a prompt without one | Unit test: assembly throws when claim set is absent |
| IV | No cold outreach or bulk messaging | Only one email path exists (owner notification, Phase 4), addressed to a workspace member | Code review; SC-007 |
| V | Team-only, RLS | Supabase Auth + membership gate in `(ops)/layout.tsx` *and* RLS underneath | RLS integration tests (SC-003) |
| VI | Multi-workspace from day one | `workspace_id` on every business table in the first migration | Migration review; second-workspace smoke test (SC-001) |
| VII | Everything audited | `ai_run_logs` and `audit_logs` written in the same transaction as the run/decision they describe | Integration test per run type (SC-006) |
| VIII | Cost caps mandatory | Cap checked and counted inside a transaction before the provider call | Integration test at the cap boundary |
| IX | Secrets never reach the browser | Provider and service-role keys read only in server modules; no `NEXT_PUBLIC_` prefix on any of them | CI check for `NEXT_PUBLIC_` on secret names |
| X | Simple, complete, runnable | Single-shot workflows; no agent loops; one app, one provider interface | Plan review |

**Result: PASS** — no violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-founder-ops-core/
├── spec.md              # WHAT (written)
├── plan.md              # This file
├── data-model.md        # Phase 1 output — tables, columns, RLS policies
├── quickstart.md        # Phase 1 output — local Supabase + env setup
├── contracts/           # Phase 1 output — request/response shapes per route
└── tasks.md             # Phase 2 output (not created by plan)
```

### Source Code (repository root)

```text
app/
  (auth)/login/
  (ops)/layout.tsx          # membership gate
  (ops)/page.tsx            # home
  (ops)/knowledge/
  (ops)/research/
  (ops)/content/
  (ops)/approvals/
  (ops)/settings/
  (ops)/leads/              # Phase 4
  (ops)/campaigns/          # Phase 5
  api/ops/
    knowledge/              # CRUD
    research/run/
    content/run/
    approvals/[id]/decision/
    leads/ingest/           # Phase 4
    campaigns/run/          # Phase 5
lib/
  auth/                     # session + membership resolution
  db/                       # typed Supabase clients (server-only)
  ai/                       # provider interface, cap enforcement, run logging
  prompts/                  # claim-set assembly, per-bot templates
  email/                    # Phase 4
supabase/
  migrations/
  seed/                     # Lumo workspace + claims
tests/
  integration/              # RLS, caps, audit
  unit/                     # prompt assembly, validators
```

**Structure Decision**: Single Next.js app at the repository root. Server routes under
`app/api/ops/` are the only backend; there is no separate service. `lib/db` and `lib/ai`
are server-only modules and must never be imported from a client component.

## Schema (implementation order)

1. `workspaces`, `profiles`, `memberships`
2. `knowledge_docs`, `claim_sets`
3. `research_reports`, `content_drafts`, `approvals`
4. `ai_run_logs`, `audit_logs`
5. `leads`, `campaigns`

**RLS rule**: a user may read or write a row only if a `memberships` row exists linking
that user to the row's `workspace_id`. Role gates writes on top of that: viewers read
only, editors create drafts and run bots, owners do everything.

Policies are written in the same migration as the table they protect — never a follow-up
migration, so no table exists unprotected even briefly.

## Prompt policy

Every system prompt is assembled by `lib/prompts/assemble.ts` and always contains:

- the workspace `brand_voice`
- the workspace `approved_claims`
- the workspace `forbidden_claims`
- the standing instruction: *"If unknown, say unknown; never invent product facts."*

Assembly takes the claim set as a required argument and throws if it is missing, so no
code path can reach the provider with an unbound prompt.

## Phases

| Phase | Days | Contents |
|---|---|---|
| 0 — Foundation | 1–3 | Migrations, auth, workspace bootstrap (Lumo), membership, empty shell nav, RLS tests |
| 1 — Knowledge | 4–5 | CRUD docs + claims editor; seed Lumo claims from existing marketing rules |
| 2 — Research | 6–8 | Run endpoint + report UI + Fact/Inference/Hypothesis structure + `ai_run_logs` + caps |
| 3 — Content + Approvals | 9–12 | Content run, draft list, approvals inbox, status transitions |
| 4 — Leads | 13–15 | Ingest API, classify, email on high intent, leads table UI |
| 5 — Campaigns + harden | 16–18 | Campaign drafts; cap dashboards; audit views; second-workspace smoke test |

Phase 0 ships RLS tests before any feature table carries data — the isolation proof
(SC-003) is written first, not retrofitted at the end.

## Risks

| Risk | Plan |
|---|---|
| Scope creep to auto-publish | Constitution block (principle I); no publish client may enter `package.json` |
| Cross-tenant leak | RLS + integration test as two real authenticated users |
| LLM cost | Daily cap per workspace + cheap model as the default |
| Over-building agents | Single-shot workflows only; no agent loops |

## Definition of Done (v1 core)

1. Owner logs in → sees the Lumo workspace
2. Updates knowledge and claims
3. Runs research → saved report
4. Runs content → approves draft
5. AI cap blocks excess runs
6. Second workspace row isolated

## Blocking clarifications carried from the spec

These must be answered before the phase that depends on them:

| Question | Blocks | Needed by |
|---|---|---|
| FR-Q-007 — how does a second person join a workspace? No invitation entity exists. | `memberships` design and the Phase 0 migration | Phase 0 |
| FR-Q-002 — cap number, unit (runs vs tokens), reset boundary, owner-adjustable? | Cap enforcement is unimplementable without it | Phase 2 |
| FR-Q-001 — what grants an editor approval rights? | Role gate on the decision route | Phase 3 |
| FR-Q-003 / FR-Q-004 — lead score scale, high-intent threshold, segment/stage vocabulary | Classifier and notification trigger | Phase 4 |
| FR-Q-005 — what is Telegram for? | Nothing yet; unscheduled in these phases | Post-v1 |
| FR-Q-006 — who may create a workspace? | Workspace bootstrap path | Phase 0 |

## Complexity Tracking

No Constitution Check violations. Table intentionally empty.
