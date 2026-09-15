---
id: 0012
title: Open sign-up and self-serve workspaces
stage: misc
date: 2026-09-15
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: muhammad.yousuf02@gmail.com
command: (direct request)
labels: ["auth", "signup", "saas", "workspaces", "constitution"]
links:
  spec: null
  ticket: null
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: null
files:
 - app/(auth)/login/page.tsx
 - app/(auth)/onboarding/page.tsx
 - app/(ops)/layout.tsx
 - app/layout.tsx
 - lib/validation/auth.ts
 - lib/validation/workspace.ts
 - tests/unit/auth-validation.test.ts
 - supabase/seed/seed-workspace.ts
 - .specify/memory/constitution.md
tests:
 - tests/unit/auth-validation.test.ts (50/50 unit PASS)
 - npm run build (PASS, includes typecheck)
 - npm run check:public-env (PASS)
---

## Prompt

change it from team only to anyone. It is not a team app but a complete SaaS project that will help other apps also..

## Response snapshot

Turned Founder Ops from team-only into open SaaS:

- `/login` now has Sign in and Create account modes. Sign-up is open; accounts are made
  with `auth.admin.createUser({ email_confirm: true })` so no confirmation link is sent.
  The earlier invite-token gate on sign-up is removed.
- New `/onboarding` page: any signed-in user creates a workspace (name + optional URL
  slug) and becomes its owner. Runs on the service-role client with the caller id taken
  from their session; rolls back the workspace if the owner membership insert fails;
  friendly message on slug collision (23505). Capped at 3 owned workspaces per user so
  the per-workspace daily AI run cap (Constitution VIII) cannot be multiplied freely.
- Ops layout: signed-in users with no workspace are redirected to `/onboarding` instead
  of seeing "Access denied". Invitations still work unchanged.
- Constitution amended to 1.1.0: Principle V is now "Open Sign-Up, Isolated Workspaces",
  RLS isolation unchanged. No database migration needed.

## Outcome

- ✅ Impact: anyone can sign up and create a workspace for their app, without an email link.
- 🧪 Tests: 50/50 unit pass (new slug/workspace validation cases); build and typecheck
  pass. Live sign-up on Vercel NOT yet run.
- 📁 Files: login, onboarding, ops layout, root layout, validation, tests, seed comment,
  constitution.
- 🔁 Next prompts: record the ADR-0001 reversal (`/sp.adr`); decide on email verification
  and bot protection for open sign-up; forgot-password flow.
- 🧠 Reflection: the DB already isolated tenants by membership, so opening sign-up was an
  app-layer change; the real new risks are unverified emails and AI cost abuse.

## Evaluation notes (flywheel)

- Failure modes observed: none in build/tests.
- Graders run and results (PASS/FAIL): unit PASS; build PASS; e2e sign-up NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): sign up on the Vercel URL with a new email,
  create a workspace, confirm it lands on Home.
