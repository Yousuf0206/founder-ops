---
id: 0016
title: Rename Founder Ops To Lumo-Ops
stage: constitution
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [rename, naming, breaking-change, cookies, ingest-api]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - package.json
  - env.example
  - app/layout.tsx
  - app/(auth)/login/page.tsx
  - app/(ops)/layout.tsx
  - app/(ops)/leads/page.tsx
  - app/(ops)/leads/[id]/page.tsx
  - app/(ops)/leads/[id]/stage-form.tsx
  - app/(ops)/settings/page.tsx
  - app/api/ops/leads/ingest/route.ts
  - app/auth/callback/route.ts
  - lib/auth/session.ts
  - lib/leads/ingest.ts
  - supabase/seed/set-ingest-secret.ts
  - supabase/migrations/0001_foundation.sql
  - supabase/migrations/0002_knowledge.sql
  - supabase/migrations/0003_research.sql
  - supabase/migrations/0004_content_approvals.sql
  - supabase/migrations/0005_leads.sql
  - supabase/migrations/0006_campaigns.sql
  - docs/workspace-starter.md
  - specs/001-founder-ops-core/spec.md
  - specs/001-founder-ops-core/plan.md
  - specs/001-founder-ops-core/tasks.md
tests:
  - npx tsc --noEmit (clean)
  - npm run build (exit 0)
  - npm test (54 passed, 53 skipped; 4 integration files fail on no local Supabase — pre-existing)
---

## Prompt

no problem about renaming. do it, as it will work as fresh work

## Response snapshot

Full rename with no compatibility window, per the user's "fresh work" instruction —
no dual-accept shim for the old header names.

Renamed across 24 files: `Founder Ops` → `Lumo-Ops`, `founder-ops` → `lumo-ops`.
Covers the three groups previously flagged as wire contracts, not just copy:

- Lead-ingest headers → `x-lumo-ops-workspace` / `x-lumo-ops-secret`
  (`app/api/ops/leads/ingest/route.ts:29-30`), with the docs at
  `app/(ops)/settings/page.tsx:109-110` and the seed script output at
  `supabase/seed/set-ingest-secret.ts:71-72` kept in sync.
- Cookies → `lumo-ops-workspace` (`lib/auth/session.ts:11`) and
  `lumo-ops-auth-next` (`app/auth/callback/route.ts:7`). Existing sessions and any
  in-flight magic-link redirects are invalidated; acceptable on fresh work.
- `package.json` name → `lumo-ops`.

Plus UI copy (`app/layout.tsx` metadata title, login page, ops shell, leads pages),
lead-notification body text in `lib/leads/ingest.ts:186`, migration header comments,
`env.example`, and `docs/workspace-starter.md`.

Deliberately left alone: the feature slug `001-founder-ops-core` — the specs
directory name, the `**Feature Branch**` / `**Branch**` fields, and the in-doc path
references. That slug is the git branch identity that `.specify` scripts derive
feature context from, so renaming the directory without renaming the branch would
break feature detection. Prose inside those three spec docs was renamed to Lumo-Ops;
one historical table cell (`plan.md:35`, `apps/ops/` vs `founder-ops/`) was left as
the record of a decision made under the old name.

## Outcome

- ✅ Impact: Product is Lumo-Ops end to end in code, copy, migrations comments, and
  env template. Two breaking wire changes shipped intentionally: ingest header names
  and cookie names.
- 🧪 Tests: `npx tsc --noEmit` clean. `npm run build` exit 0 (all routes compiled). `npm test` → 54 passed, 53 skipped, 4 integration
  files failed with `AuthRetryableFetchError: fetch failed` — they target
  `TEST_SUPABASE_URL=http://127.0.0.1:54321` and no local Supabase is running. Pre-existing
  environment gap, unrelated to the rename (the rename touched no RLS policy or SQL DDL,
  only SQL header comments).
- 📁 Files: 24 changed (listed above)
- 🔁 Next prompts: re-audit `specs/001-founder-ops-core/` against constitution v2.0
  Principles III–V — those docs were written under v1.0.0 draft-only and their
  governed-by lines still say v1.0.0; consider the publish-mode/connector-token ADR;
  optionally rename the git branch + spec dir to `001-lumo-ops-core` together.
- 🧠 Reflection: The spec-folder slug is infrastructure, not branding — it is the key
  `.specify` uses to resolve feature context, so it survives a product rename unless
  the branch is renamed in the same move.

## Evaluation notes (flywheel)

- Failure modes observed: none from the rename. The integration-test failures are an
  unrelated missing local Supabase and would have been misread as rename fallout
  without checking what the tests actually connect to.
- Graders run and results (PASS/FAIL): typecheck PASS; unit tests PASS; integration
  tests INCONCLUSIVE (no local DB)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): start local Supabase and re-run
  `npm test` to convert the 4 inconclusive files into a real signal.
