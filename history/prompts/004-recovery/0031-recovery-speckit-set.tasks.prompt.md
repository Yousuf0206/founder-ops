---
id: 0031
title: Recovery Speckit Set Intake
stage: tasks
date: 2026-11-15
surface: agent
model: claude-opus-5
feature: 004-recovery
branch: main
user: yousuf0206
command: (pasted speckit set — constitution + specify + plan + tasks)
labels: ["recovery", "speckit", "production", "observability", "instant"]
links:
  spec: specs/004-recovery/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - .specify/memory/constitution.md
 - specs/004-recovery/spec.md
 - specs/004-recovery/plan.md
 - specs/004-recovery/tasks.md
 - app/(auth)/login/page.tsx
 - app/(growth)/next/page.tsx
 - app/(growth)/start/actions.ts
 - app/(growth)/pack/actions.ts
 - app/api/growth/analyze/route.ts
 - app/api/growth/pack/route.ts
 - app/api/health/route.ts
 - lib/obs/log.ts
 - docs/dogfood-production.md
tests:
 - npm run typecheck (pass)
 - npm run check:public-env (pass)
 - npm run check:publish-guards (pass)
 - npm run test (210 passed, 120 skipped; 8 integration files fail — no local Supabase at 127.0.0.1:54321, pre-existing)
 - npm run build (pass; /next and /api/health in the route table)
---

## Prompt

# Lumo Grow — Speckit Set (Recovery / Post-Roast)
**Version:** 5.1.0-recovery
**Product:** Lumo Grow (lumo-ops)
**Production:** https://lumo-ops.vercel.app
**Dogfood URL:** https://lumo-learn.com
**Status:** BINDING for this recovery milestone

This set has four binding parts:
1. `sp.constitution`
2. `sp.specify`
3. `sp.plan`
4. `sp.tasks`

(Full text of the four parts as pasted: constitution core vision and rules 1-10 with
anti-patterns and success standard; specify with problem statement, goals, US1-US5,
SC-01-SC-09, FR-01-FR-10, NFR-01-NFR-03, out of scope, assumptions; plan with strategy,
architecture stance, phases 0-5 and their details, risks, definition of milestone done;
tasks T-0.1-T-5.4 with non-tasks, the owner dogfood checklist, and the milestone-complete
criteria. The set is reproduced in full and unparaphrased across
`.specify/memory/constitution.md` § Recovery Milestone, `specs/004-recovery/spec.md`,
`specs/004-recovery/plan.md` and `specs/004-recovery/tasks.md`, which are the binding
copies.)

## Response snapshot

Audited the repo and production before writing anything, then recorded the set and closed
the items that did not need the owner.

Audit: all required env vars are present on Vercel Production (`founder-ops`, alias
`lumo-ops.vercel.app`), including AI and the three LinkedIn values; `/` already redirects
to `/start` (verified live, 307); the error taxonomy, unbound Instant analyze, goal `other`
cap, pack generation, `content_drafts` persistence and IG draft-only gating are all already
in code — spec 003's task list had gone stale and under-reported them. Two real gaps the
audit found: `/next` was in the nav but did not exist (404 in production), and nothing on
the analyze path logged anything at all.

Written this turn: the constitution amendment (5.1.0-recovery, rules R1-R10, no principle
repealed); `specs/004-recovery/{spec,plan,tasks}.md` with per-task status against observed
reality rather than against merged code; the logged-out value prop on the auth surface;
`/next` as destination 5 of 5 (receipts + exactly three next actions); `lib/obs/log.ts`
plus instrumentation of both server actions and both API routes; `GET /api/health`;
`docs/dogfood-production.md`.

## Outcome

- ✅ Impact: Phases 1, 2 and 5 are code-complete; Phase 0 is configured and awaiting one
  real production run; Phase 4 has one open decision (D-1, the shape of Instant Publish).
- 🧪 Tests: typecheck, both guard scripts and the build pass; 210 unit tests pass; the 8
  failing integration files need a local Supabase and failed the same way before this work.
- 📁 Files: 13 (4 docs/specs, 1 constitution, 6 app files, 1 new lib, 1 new doc).
- 🔁 Next prompts: resolve D-1, then T-4.3; owner runs T-0.4, T-3.4, T-3.5, T-4.2, T-4.4.
- 🧠 Reflection: the milestone's premise was "the loop is incomplete"; the audit says it is
  mostly complete and almost entirely unproven on production. Status vocabulary in
  tasks.md was changed to separate the two, since conflating them is what produced the
  roast.

## Evaluation notes (flywheel)

- Failure modes observed: spec 003's tasks.md listed Phase B/C/D as open while the code was
  largely written — checkbox drift, which made the product look less finished than it is.
- Graders run and results (PASS/FAIL): typecheck PASS, check:public-env PASS,
  check:publish-guards PASS, build PASS, unit tests PASS, integration tests SKIPPED (no
  local Supabase).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the owner run the dogfood checklist
  unaided and record where it stops — that single data point retires or confirms every `[~]`
  in the list.
