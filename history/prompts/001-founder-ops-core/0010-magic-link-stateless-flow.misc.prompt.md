---
id: 0010
title: Stateless magic link via token hash
stage: misc
date: 2026-09-13
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: muhammad.yousuf02@gmail.com
command: (direct request)
labels: ["auth", "supabase", "magic-link", "pkce", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - supabase/config.toml
 - supabase/templates/magic_link.html
 - app/(auth)/login/page.tsx
 - app/auth/callback/route.ts
tests:
 - npx tsc --noEmit (clean)
---

## Prompt

email rate limit exceeded

code challenge does not match previously saved code verifier

## Response snapshot

Two follow-on errors after the callback started surfacing real provider messages
(see PHR 0009).

1. "email rate limit exceeded" — `[auth.rate_limit] email_sent = 2` in
   `supabase/config.toml`, i.e. two sign-in emails per hour. Raised to 100 for
   local dev. Hosted projects cap the built-in SMTP independently and need custom
   SMTP instead; the config file does not apply there.

2. "code challenge does not match previously saved code verifier" — the PKCE
   verifier cookie set by `signInWithOtp` did not survive the round trip through
   the mail client (stale link, cross-origin `localhost` vs `127.0.0.1`, or a
   different browser). Rather than chase the cookie, switched email sign-in to
   Supabase's stateless `token_hash` flow, which carries no verifier requirement:
   a custom `magic_link` template links to
   `/auth/callback?token_hash=...&type=email`, which the callback already handled.

   Tradeoff: a `token_hash` link cannot carry the `next` query param the invite
   path depends on. Preserved it in a short-lived httpOnly cookie set by the login
   server action and consumed (and deleted) by the callback, origin-checked on both
   write and read.

## Outcome

- ✅ Impact: email sign-in no longer depends on a cookie surviving the mail client;
  local email rate limit no longer blocks iteration.
- 🧪 Tests: `npx tsc --noEmit` clean. Full sign-in round trip NOT yet run.
- 📁 Files: `supabase/config.toml`, `supabase/templates/magic_link.html`,
  `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts`
- 🔁 Next prompts: run one clean sign-in against a restarted local stack; review
  `shouldCreateUser: true` against Constitution V.
- 🧠 Reflection: three successive errors were all one chain — each fix revealed the
  next real message, which the original opaque callback had been hiding.

## Evaluation notes (flywheel)

- Failure modes observed: PKCE verifier cookie is fragile for email links.
- Graders run and results (PASS/FAIL): typecheck PASS; e2e auth NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): `supabase stop && supabase start`, then
  one magic-link sign-in end to end.
