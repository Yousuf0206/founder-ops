---
id: 0007
title: Phase One Knowledge
stage: green
date: 2026-09-11
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [implementation, phase-1, knowledge, claims, rls, zod]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: null
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: null
files:
  - supabase/migrations/0002_knowledge.sql
  - supabase/seed/seed-claims.ts
  - lib/validation/knowledge.ts
  - lib/knowledge/repo.ts
  - lib/http/errors.ts
  - app/api/ops/knowledge/route.ts
  - app/api/ops/knowledge/[id]/route.ts
  - app/api/ops/knowledge/claims/route.ts
  - app/(ops)/knowledge/page.tsx
  - app/(ops)/knowledge/actions.ts
  - app/(ops)/knowledge/doc-form.tsx
  - app/(ops)/knowledge/new/page.tsx
  - app/(ops)/knowledge/[id]/page.tsx
  - app/(ops)/knowledge/claims/page.tsx
  - app/(ops)/knowledge/claims/claims-form.tsx
  - tests/unit/knowledge-validation.test.ts
  - tests/integration/rls-knowledge.test.ts
  - vitest.config.ts
  - package.json
  - specs/001-founder-ops-core/tasks.md
tests:
  - "npm run typecheck — PASS (clean)"
  - "npm run build — PASS (13 routes + middleware)"
  - "npm run check:public-env — PASS"
  - "npm test — 15 unit tests PASSED; 26 RLS tests SKIPPED (13 foundation + 13 knowledge)"
---

## Prompt

now start phase 1

## Response snapshot

Implemented Phase 1 (Knowledge), tasks T1.1-T1.7.

Schema (`0002_knowledge.sql`): `knowledge_docs` and `claim_sets`, with RLS policies in the
same migration per the plan rule. Read is gated by `is_member()`, writes by `can_write()`,
both defined in Phase 0 — so the role gate (T1.7) is one predicate swap rather than new
machinery. `claim_sets` is keyed by `workspace_id` as its primary key, making "one claim
set per workspace" a schema constraint rather than a convention: two claim sets would mean
two answers to "what may we say", and prompt assembly would have to choose. No DELETE
policy on `claim_sets` — a workspace without one cannot generate at all, so deletion is
not an operation the product offers; clearing the arrays is.

Validation (`lib/validation/knowledge.ts`): Zod schemas shared by the API routes and the UI
server actions, so the two entry points cannot drift. Blank claim lines are dropped rather
than rejected, because the editor is one textarea line per claim and a trailing newline is
not a user error.

Data access (`lib/knowledge/repo.ts`): one module used by both routes and actions. Every
query filters `workspace_id` explicitly even though RLS would scope it anyway — the filter
states the intent, RLS makes it true. `getClaimSet` returns null rather than an empty
object when none exists, because Phase 2 must distinguish "no claims defined" (refuse to
generate, Constitution III) from "empty claims".

UI: doc list with a claim-set summary that leads the page, create/edit form, and the claims
editor. Viewers get read-only renderings rather than a form that cannot save.

Seed (`seed-claims.ts`): seeds 16 forbidden claims and a brand voice, and leaves
`approved_claims` EMPTY on purpose. Approved claims are product facts; inventing them would
write fabricated facts into the one store the constitution designates as the source of
truth. Re-running never overwrites a non-empty list.

Build fix: Next.js permits only HTTP method exports from a route module, so the shared
`toResponse` helper moved from the knowledge route to `lib/http/errors.ts`.

## Outcome

- ✅ Impact: Phase 1 code complete. 15 unit tests execute and pass — the first tests in this project that actually run.
- 🧪 Tests: typecheck/build/env-guard PASS; 15 unit PASS; 26 RLS tests SKIPPED (still no database).
- 📁 Files: 18 created, 3 modified.
- 🔁 Next prompts: stand up Supabase and run the 26 RLS tests, or continue to Phase 2 (Research) with the verification gap still open.
- 🧠 Reflection: The gap is now two phases deep — 26 RLS tests written, none executed. Each phase that ships without a database makes the eventual first run more likely to surface several failures at once rather than one.

## Evaluation notes (flywheel)

- Failure modes observed: route modules may not export non-HTTP helpers (caught by build, not typecheck); vitest needed the `@` alias added to resolve app-style imports.
- Graders run and results (PASS/FAIL): typecheck PASS, build PASS, check:public-env PASS, unit PASS (15/15), RLS NOT RUN (0/26)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): `supabase start` locally so the 26 RLS tests execute before Phase 2 adds more.
