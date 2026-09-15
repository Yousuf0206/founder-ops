---
id: 0022
title: Phase Zero Gate On Hosted Supabase
stage: misc
date: 2026-09-16
surface: claude-code-cli
model: claude-opus-5
feature: 002-growth-platform-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [phase-gate, integration-tests, supabase, rls]
links:
  spec: specs/002-growth-platform-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - tests/helpers/supabase.ts
  - env.example
  - specs/002-growth-platform-core/tasks.md
tests:
  - npx vitest run (all 8 files) against the integrated hosted Supabase project
---

## Prompt

use the supabase that is integrated to it

## Response snapshot

The hosted project already had all 13 v1 tables and was live (2 users, 2 workspaces). The
owner chose to run the destructive integration tests there. The test helper's guard now
requires `TEST_SUPABASE_ALLOW_APP_PROJECT=true` when the test URL equals the app URL,
instead of refusing outright. Rewriting `.env` with copied secrets was denied, so the
test variables were passed in memory to one vitest run instead. Result: 8 files, 107/107
passed (53 integration), 0 skipped. Residue check found one leftover `owner-*@example.test`
user from the invitation-redemption suite; it was deleted, restoring the baseline. The
opt-in flags are documented in `env.example`. In tasks.md, T0.8 is marked done and T0.11
records the pass for schema 0001–0007.

## Outcome

- ✅ Impact: Phase 0 gate passed for the inherited schema; v1 RLS, caps, and audit are now proven, not just reviewed
- 🧪 Tests: 107 passed, 0 skipped, 0 failed
- 📁 Files: tests/helpers/supabase.ts, env.example, tasks.md
- 🔁 Next prompts: T0.9 migration 0008 (plans + settings), then T0.3 empty-approved refusal
- 🧠 Reflection: `deleteUser()` ignores errors, so a failed cleanup is silent — only the residue check caught it

## Evaluation notes (flywheel)

- Failure modes observed: a silent cleanup failure left one test user in the live project
- Graders run and results (PASS/FAIL): vitest PASS
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): make `deleteUser()` throw on error so cleanup failures are visible
