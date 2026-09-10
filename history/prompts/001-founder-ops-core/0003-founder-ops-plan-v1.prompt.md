---
id: 0003
title: Founder Ops Plan v1
stage: plan
date: 2026-09-11
surface: claude-code-cli
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [plan, founder-ops, nextjs, supabase, rls, phases]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/001-founder-ops-core/plan.md
tests:
  - (none)
---

## Prompt

# Founder Ops — Plan v1.0

## 1. Technical approach
Greenfield Next.js app (or apps/ops in monorepo) with Supabase Auth + Postgres.
AI via server routes calling one configured model provider.
Multi-tenant via workspace_id on every business row + Supabase RLS.

## 2. Stack
| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15 App Router, TS strict, Tailwind |
| Auth | Supabase Auth |
| DB | Supabase Postgres + RLS |
| AI | Server-side provider (OpenRouter/Google/etc. via env) |
| Email | Resend or Supabase-friendly SMTP |
| Host | Vercel |

Dify is optional later; not required for v1.

## 3. Repo layout (target)
```text
apps/ops/ or founder-ops/
  app/
    (auth)/login
    (ops)/layout.tsx          # membership gate
    (ops)/page.tsx            # home
    (ops)/knowledge/
    (ops)/research/
    (ops)/content/
    (ops)/approvals/
    (ops)/leads/              # phase
    (ops)/campaigns/          # phase
    (ops)/settings/
  app/api/ops/...
  lib/
    db/, ai/, prompts/, auth/, email/
  supabase/migrations/

## 4. Schema (implementation order)

workspaces, profiles, memberships
knowledge_docs, claim_sets
research_reports, content_drafts, approvals
ai_run_logs, audit_logs
leads, campaigns

RLS: user sees rows only if membership exists for workspace_id.

## 5. Prompt policy
System prompt always includes:

workspace brand_voice
approved_claims
forbidden_claims
"If unknown, say unknown; never invent product facts."

## 6. Phases
Phase 0 — Foundation (days 1-3)
Migrations, auth, workspace bootstrap (Lumo), membership, empty shell nav, RLS tests.
Phase 1 — Knowledge (days 4-5)
CRUD docs + claims editor; seed Lumo claims from existing marketing rules.
Phase 2 — Research (days 6-8)
Run endpoint + report UI + Fact/Inference/Hypothesis structure + ai_run_log + caps.
Phase 3 — Content + Approvals (days 9-12)
Content run, draft list, approvals inbox, status transitions.
Phase 4 — Leads (days 13-15)
Ingest API, classify, email on high intent, leads table UI.
Phase 5 — Campaigns + harden (days 16-18)
Campaign drafts; cap dashboards; audit views; second workspace smoke test.

## 7. Risks

Risk | Plan
Scope creep to auto-publish | Constitution block
Cross-tenant leak | RLS + integration test
LLM cost | Cap + cheap model default
Over-building agents | Single-shot workflows only

## 8. Definition of done (v1 core)

Owner logs in -> sees Lumo workspace
Updates knowledge/claims
Runs research -> saved report
Runs content -> approves draft
AI cap blocks excess runs
Second workspace row isolated

> Note: as pasted, the section-3 code fence was left unclosed, so sections 4-8 rendered
> inside it, and the section-7 risk table arrived collapsed onto a single line. The
> reconstruction above restores the intended structure; content is unchanged.

## Response snapshot

Wrote `specs/001-founder-ops-core/plan.md`. Reconstructed the mangled paste (unclosed code
fence swallowing sections 4-8; collapsed risk table). Resolved the four either/or choices
the plan left open and recorded each with a rationale: single app at repo root rather than
`apps/ops/`; provider behind a single `lib/ai/provider.ts` env-selected interface; Resend
deferred to Phase 4; no Dify. Added a Constitution Check gate mapping all ten principles
to a mechanism and a verification method - result PASS, Complexity Tracking empty. Added
two design rules not in the source plan: RLS policies ship in the same migration as their
table, and `lib/prompts/assemble.ts` takes the claim set as a required argument and throws
without it. Carried the seven spec clarifications forward as a table keyed to the phase
each one blocks.

## Outcome

- Impact: The HOW is written and constitution-checked; phases are sequenced with explicit blockers.
- Tests: none yet (plan stage; test strategy defined - Vitest, RLS integration tests as two real users)
- Files: `specs/001-founder-ops-core/plan.md` (new)
- Next prompts: answer FR-Q-007, FR-Q-006, FR-Q-002; then `/sp.tasks` for Phase 0 tickets.
- Reflection: FR-Q-007 (no invitation path) now blocks Phase 0 rather than merely being an open question - the `memberships` migration cannot be designed without knowing how a second person joins.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): Constitution Check PASS (10/10 principles mapped to mechanism + verification)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
