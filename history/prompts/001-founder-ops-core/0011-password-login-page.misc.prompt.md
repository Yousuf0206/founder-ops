---
id: 0011
title: Password login replaces magic link
stage: misc
date: 2026-09-15
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: muhammad.yousuf02@gmail.com
command: (direct request)
labels: ["auth", "supabase", "password", "login", "invitations"]
links:
  spec: null
  ticket: null
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: null
files:
 - app/(auth)/login/page.tsx
 - lib/validation/auth.ts
 - supabase/seed/set-password.ts
 - tests/unit/auth-validation.test.ts
 - package.json
tests:
 - tests/unit/auth-validation.test.ts (7 new, 48/48 unit PASS)
 - npm run build (PASS, includes typecheck)
 - npm run check:public-env (PASS)
---

## Prompt

the app is sending a link, but it is not opening. why i need link to open the app?

the app is on vercel now, and supabase send email to my email address. No instead of sending link, you should create a proper login page in this way the problem will solve.

## Response snapshot

Diagnosis: the app uses hosted Supabase, so the local `supabase/templates/magic_link.html`
and `config.toml` never applied; the hosted default email redirects via the dashboard
Site URL, which pointed at `localhost:3000`.

Replaced magic-link sign-in with email + password (`signInWithPassword`) — no email is
sent at all. Account creation stays team-only (Constitution V, ADR-0001): the
"Create account" form appears only when `next` is `/invite/<token>`, and the server
action verifies, with the service-role client, that the invitation is unaccepted,
unexpired, and addressed to the submitted email before calling
`auth.admin.createUser({ email_confirm: true })`. Existing users (created via magic
link, so passwordless) get one from the new `npm run set:password -- --email ...`
admin script. Sign-in errors are generic so they do not reveal which emails exist.

## Outcome

- ✅ Impact: sign-in works on any device without an email round trip.
- 🧪 Tests: 7 new validation tests; 48/48 unit pass; build and typecheck pass. Live
  sign-in against the hosted project NOT yet run.
- 📁 Files: login page, auth validation, set-password script, unit test, package.json.
- 🔁 Next prompts: run `set:password` for the owner; confirm `SUPABASE_SERVICE_ROLE_KEY`
  is set on Vercel (invite account creation needs it); sign in on the Vercel URL.
- 🧠 Reflection: the root issue was config drift between local files and the hosted
  project; removing the email hop removes that whole class of failure.

## Evaluation notes (flywheel)

- Failure modes observed: local Supabase config assumed to apply to a hosted project.
- Graders run and results (PASS/FAIL): unit PASS; build PASS; e2e auth NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): sign in on Vercel with a password set by script.
