---
id: 0008
title: Phases Two To Five
stage: green
date: 2026-09-11
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [implementation, phase-2, phase-3, phase-4, phase-5, caps, approvals, leads, campaigns]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: null
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: null
files:
  - supabase/migrations/0003_research.sql
  - supabase/migrations/0004_content_approvals.sql
  - supabase/migrations/0005_leads.sql
  - supabase/migrations/0006_campaigns.sql
  - lib/prompts/assemble.ts
  - lib/ai/provider.ts
  - lib/ai/run.ts
  - lib/ai/research.ts
  - lib/ai/content.ts
  - lib/ai/campaign.ts
  - lib/approvals/repo.ts
  - lib/leads/ingest.ts
  - lib/email/notify.ts
  - lib/http/run-errors.ts
  - app/api/ops/research/run/route.ts
  - app/api/ops/content/run/route.ts
  - app/api/ops/approvals/[id]/decision/route.ts
  - app/api/ops/leads/ingest/route.ts
  - app/api/ops/campaigns/run/route.ts
  - app/(ops)/research/
  - app/(ops)/content/
  - app/(ops)/approvals/
  - app/(ops)/leads/
  - app/(ops)/campaigns/
  - app/(ops)/settings/
  - app/(ops)/audit/page.tsx
  - app/(ops)/status-pill.tsx
  - scripts/check-no-publish.mjs
  - supabase/seed/set-ingest-secret.ts
  - tests/unit/prompt-assembly.test.ts
  - tests/unit/lead-ingest.test.ts
  - tests/integration/caps-and-approvals.test.ts
  - tests/integration/rls-full-isolation.test.ts
  - tests/stubs/server-only.ts
  - specs/001-founder-ops-core/self-audit.md
  - specs/001-founder-ops-core/spec.md
  - specs/001-founder-ops-core/tasks.md
tests:
  - "npm run typecheck — PASS (clean)"
  - "npm run build — PASS (29 routes + middleware)"
  - "npm run check:public-env — PASS"
  - "npm run check:no-publish — PASS"
  - "npm test — 41 unit tests PASSED; 53 integration tests SKIPPED (no database)"
---

## Prompt

complete all phases first then ask me for commit

## Response snapshot

Implemented Phases 2 through 5 — all 56 tasks in tasks.md now marked complete.

**Phase 2 (Research).** Cap enforcement is a Postgres function, not application code:
`claim_ai_run()` takes an advisory lock, counts today's runs, and inserts the reservation
row in one statement, so the concurrency edge case spec.md names cannot occur. A refused
run is itself logged and does not consume the cap. `assembleSystemPrompt()` takes the claim
set as a required argument and throws without it, making Constitution III structural.
Provider is env-selected behind one module using the OpenAI-compatible shape.

**Phase 3 (Content + Approvals).** `decide_on_draft()` performs the status change, the
preserved original payload, the approvals row, and the audit row in one SECURITY DEFINER
function — an approval cannot exist without its audit entry. There is deliberately no
UPDATE policy on `content_drafts`, so a client cannot set status directly; and a trigger
rejects any insert whose status is not draft/awaiting_approval, so a draft cannot be born
approved. Added `check-no-publish.mjs`, which blocks 20 publishing and bulk-messaging
packages at build time.

**Phase 4 (Leads).** The one sessionless route, authenticated by a per-workspace secret
stored as a SHA-256 hash and compared in constant time; the workspace is resolved from the
verified secret, never the body. Duplicate emails increment `seen_count` rather than
creating a second lead. `notifyTeamMember()` takes one recipient read from
`workspaces.notify_email` — there is no code path from a lead's address to a send.
Needed sessionless variants of the log functions (`*_system`), granted to service-role
only.

**Phase 5 (Campaigns + harden).** Campaigns reuse the same `approvals` table and mirror
`decide_on_draft`. Settings expose the cap, the notify address, and the FR-Q-001 approval
grant. Audit viewer reads both log tables. Wrote `self-audit.md` answering the
constitution's six questions with evidence and an explicit list of what is unverified.

**Assumptions taken, not decisions.** FR-Q-001 became a per-membership `can_approve` flag;
FR-Q-003 became a 0-100 score with high intent at >= 70; FR-Q-004 became three fixed enums.
All three recorded in spec.md under "Assumptions Taken Without an Answer". FR-Q-005
(Telegram) left unimplemented, and `telegraf` is on the blocked list.

Two build failures fixed: a `"use server"` module may only export async functions (the
error-message helper was exported), and `server-only` cannot resolve under vitest (aliased
to a stub, with the real guard still applying to `next build`).

## Outcome

- ✅ Impact: All six phases code complete. 29 routes build; 41 unit tests pass.
- 🧪 Tests: typecheck/build/both guards PASS; 41 unit PASS; 53 integration SKIPPED.
- 📁 Files: ~40 created across four migrations, six lib modules, five API routes, six UI sections.
- 🔁 Next prompts: user asked to be asked for commit — awaiting that. Then: stand up Supabase and run the 53 integration tests.
- 🧠 Reflection: The verification gap is now the dominant risk. Six unapplied migrations and 53 unrun tests mean the first `supabase db push` is likely to surface several failures at once, and every safety claim in self-audit.md rests on inspection rather than execution.

## Evaluation notes (flywheel)

- Failure modes observed: `"use server"` exports must all be async; vitest cannot resolve `server-only`; an over-strict grep produced a false "missing RLS" reading that a corrected regex disproved.
- Graders run and results (PASS/FAIL): typecheck PASS, build PASS (29 routes), check:public-env PASS, check:no-publish PASS, unit 41/41 PASS, integration 0/53 NOT RUN
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): `supabase start` + `db push`, then `npm test` — the single highest-information action available.
