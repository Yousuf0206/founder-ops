---
id: 0005
title: Phase Zero Foundation
stage: green
date: 2026-09-11
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: 001-founder-ops-core
user: Yousuf0206
command: /sp.implement
labels: [implementation, phase-0, supabase, rls, auth, invitations]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - package.json
  - tsconfig.json
  - next.config.ts
  - postcss.config.mjs
  - vitest.config.ts
  - .gitignore
  - env.example
  - middleware.ts
  - app/layout.tsx
  - app/globals.css
  - app/(auth)/login/page.tsx
  - app/(auth)/invite/[token]/page.tsx
  - app/(ops)/layout.tsx
  - app/(ops)/page.tsx
  - app/auth/callback/route.ts
  - app/auth/sign-out/route.ts
  - lib/db/server.ts
  - lib/auth/session.ts
  - supabase/migrations/0001_foundation.sql
  - supabase/seed/seed-workspace.ts
  - scripts/check-public-env.mjs
  - tests/helpers/supabase.ts
  - tests/integration/rls-foundation.test.ts
  - specs/001-founder-ops-core/spec.md
  - specs/001-founder-ops-core/tasks.md
tests:
  - "npm run typecheck — PASS (clean)"
  - "npm run build — PASS (7 routes + middleware)"
  - "npm run check:public-env — PASS"
  - "npm test — 13 tests SKIPPED (no local Supabase configured); none executed"
---

## Prompt

/sp.implement

## Response snapshot

Ran the `/sp.implement` command against `specs/001-founder-ops-core/tasks.md`.

The prerequisites script failed first: it derives the feature directory from the git
branch, which was `master`, so it looked for `specs/master`. Created branch
`001-founder-ops-core` to match the feature directory.

Asked the three blocking clarifications before writing the migration, since all three
shape schema. All answered as recommended:
- FR-Q-007 → owner invites by email (`invitations` table + token redemption)
- FR-Q-006 → workspace creation is seed/admin only
- FR-Q-002 → 50 runs/day, counted as runs, UTC reset, owner-editable

Implemented all 12 Phase 0 tasks (T0.1-T0.12), 23 files. Notable choices:
- `app/page.tsx` removed in favour of `app/(ops)/page.tsx` at `/`, avoiding a route
  collision between the root redirect and the ops home.
- `import "server-only"` at the top of `lib/db/server.ts` and `lib/auth/session.ts`, so a
  client component importing them is a build error rather than a leaked key.
- RLS policies live in the same migration as their tables, per the plan rule. `force row
  level security` set on all four so even a table owner is subject to them.
- Membership helper functions are `SECURITY DEFINER` so policies on `memberships` can
  consult membership without recursing into their own check.
- No INSERT policy on `workspaces` for authenticated users, which is FR-Q-006 enforced in
  the database rather than in application code.
- `accept_invitation()` is `SECURITY DEFINER` because the invitee is not yet a member and
  so cannot see the workspace row; it verifies the token is live and addressed to the
  caller's own email before creating the membership.

Verification: typecheck clean, production build succeeds (7 routes + middleware),
`check:public-env` passes. The 13 RLS tests were written but all reported `skipped` -
`TEST_SUPABASE_*` is unset and no database exists yet. Fixed two TS7006 errors where
`@supabase/ssr@0.5.2`'s deprecated-cookie-method union blocks contextual inference of the
`setAll` parameter; annotated explicitly.

## Outcome

- ✅ Impact: Phase 0 code complete on branch `001-founder-ops-core`; auth, workspace, membership, invitations, and RLS policies exist and build.
- 🧪 Tests: typecheck/build/env-guard PASS; 13 RLS tests written but SKIPPED, never executed against a database.
- 📁 Files: 23 created, 2 spec documents updated (resolved clarifications, task checkboxes).
- 🔁 Next prompts: create a Supabase project, apply the migration, run the seed, then `npm test` to close the verification gap. Then Phase 1 (Knowledge).
- 🧠 Reflection: Phase 0's DoD is "RLS proven by test, not by inspection" and that DoD is not met — the proof is written but unrun. Recorded as an explicit "Phase 0 verification gap" section in tasks.md rather than marking the phase done.

## Evaluation notes (flywheel)

- Failure modes observed: spec-kit prerequisites script assumes branch name equals feature directory name; `.env.example` blocked by a Read deny rule, so the template was written as `env.example`.
- Graders run and results (PASS/FAIL): typecheck PASS, build PASS, check:public-env PASS, RLS suite NOT RUN
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): stand up local Supabase (`supabase start`) so the RLS suite executes on every future phase.
