---
id: 0029
title: Google OAuth provider not enabled
stage: explainer
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Yousuf0206
command: none
labels: ["auth", "supabase", "google-oauth", "configuration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/0029-google-oauth-provider-not-enabled.explainer.prompt.md
tests:
 - none
---

## Prompt

{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}

## Response snapshot

Identified the error as Supabase Auth rejecting the Google sign-in requested at app/(auth)/login/page.tsx:107-108 because the Google provider is not enabled in the Supabase project. Gave dashboard and Google Cloud setup steps; no code change needed for the error itself.

## Outcome

- ✅ Impact: Cause identified as Supabase project configuration; no code changed.
- 🧪 Tests: None run; no code changed.
- 📁 Files: Added this PHR only.
- 🔁 Next prompts: User enables Google in Supabase and retries sign-in.
- 🧠 Reflection: The Supabase project state was inferred from the error text, not inspected directly.

## Evaluation notes (flywheel)

- Failure modes observed: None.
- Graders run and results (PASS/FAIL): None.
- Prompt variant (if applicable): None.
- Next experiment (smallest change to try): None.
