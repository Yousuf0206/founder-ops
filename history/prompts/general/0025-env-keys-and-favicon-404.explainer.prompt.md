---
id: 0025
title: Env Keys And Favicon 404
stage: explainer
date: 2026-11-01
surface: agent
model: claude-opus-5
feature: none
branch: main
user: muhammad.yousuf02@gmail.com
command: none
labels: ["env", "supabase", "auth", "nextjs", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
tests:
---

## Prompt

what is SUPABASE_SERVICE_ROLE_KEY

The key look like below
sb_secret_DCXtb

??

what will next_public_site_url?

Failed to load resource: the server responded with a status of 404 () /favicon.ico:1

## Response snapshot

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase admin key that bypasses RLS entirely; server-only secret.
  Used here solely via `createSupabaseAdminClient()` (`lib/db/server.ts:59`) and the `supabase/seed/*`
  scripts; tests use `TEST_SUPABASE_SERVICE_ROLE_KEY`.
- `sb_secret_...` is Supabase's new prefixed API key format replacing the legacy `service_role` JWT
  (`sb_publishable_...` replaces `anon`). Drop-in here — nothing validates the key's shape. Noted that
  `@supabase/supabase-js@^2.47.10` predates the format and may warrant a bump.
- `NEXT_PUBLIC_SITE_URL`: the app's own public base URL. `http://localhost:3000` in dev, the real
  domain in production. `requestOrigin()` prefers the live Host header (so previews/localhost need no
  config); `trustedSiteOrigin()` ignores headers and uses this var for EMAILED links to prevent reset
  poisoning, falling back to `VERCEL_PROJECT_PRODUCTION_URL`. Value must also be in Supabase's
  Redirect URLs allow-list.
- `/favicon.ico` 404: the project ships no icon at all — no `public/`, no `app/favicon.ico`, no
  `icon.*`, no `icons` in the `app/layout.tsx` metadata. Browsers request `/favicon.ico` unprompted,
  so the 404 is cosmetic and affects nothing. Fix options presented; awaiting user choice.

## Outcome

- ✅ Impact: Clarified three env/config questions and diagnosed the favicon 404 as a missing asset.
- 🧪 Tests: None run; explanation-only exchange.
- 📁 Files: None modified.
- 🔁 Next prompts: Decide the favicon approach (ICO in `app/`, SVG `icon.svg`, or leave it).
- 🧠 Reflection: Reading `lib/http/origin.ts` turned a generic env answer into a project-specific one
  (the emailed-links vs request-origin split is the only place the var actually matters).

## Evaluation notes (flywheel)

- Failure modes observed: None.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): N/A
