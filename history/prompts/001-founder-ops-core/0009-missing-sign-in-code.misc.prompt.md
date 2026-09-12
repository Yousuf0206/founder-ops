---
id: 0009
title: Missing sign-in code on auth callback
stage: misc
date: 2026-09-12
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: muhammad.yousuf02@gmail.com
command: (direct request)
labels: ["auth", "supabase", "magic-link", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - app/auth/callback/route.ts
 - supabase/config.toml
tests:
 - npx tsc --noEmit (clean)
---

## Prompt

Missing sign-in code

## Response snapshot

Traced the string to `app/auth/callback/route.ts:12` — it is the app's own error,
emitted when the magic-link callback arrives without a `?code=` query param.

Two root causes addressed:

1. Redirect allow-list mismatch. The login server action builds `emailRedirectTo`
   from `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000`), but local Supabase had
   `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls =
   ["https://127.0.0.1:3000"]` (https typo, no `localhost` entry at all). GoTrue
   matches `redirect_to` exactly against that list, so the callback path was
   discarded and the code never reached `/auth/callback`. Also, `localhost` and
   `127.0.0.1` are separate cookie origins, so the PKCE code-verifier cookie set
   at sign-in would not be sent on the return trip.

2. The callback only understood the PKCE `?code=` shape. Supabase can also land
   with `?token_hash=&type=` (newer default email template) or with
   `?error=&error_description=` (expired link, or one already consumed by a mail
   scanner). Both were collapsed into the same opaque message.

## Outcome

- ✅ Impact: callback now handles `code`, `token_hash`+`type`, and provider error
  params; Supabase local config matches the app's site URL.
- 🧪 Tests: `npx tsc --noEmit` clean. End-to-end sign-in not exercised (requires
  a running `supabase start` + mail catcher).
- 📁 Files: `app/auth/callback/route.ts`, `supabase/config.toml`
- 🔁 Next prompts: verify a full magic-link round trip against local Supabase;
  set `site_url` / redirect allow-list for the deployed environment too.
- 🧠 Reflection: the original route reported a symptom ("Missing sign-in code")
  rather than the provider's own reason, which hid the actual failure.

## Evaluation notes (flywheel)

- Failure modes observed: opaque error string masked an env/config mismatch.
- Graders run and results (PASS/FAIL): typecheck PASS; e2e auth NOT RUN.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run `supabase start` and complete one
  magic-link sign-in to confirm the redirect allow-list fix.
