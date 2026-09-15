---
id: 0020
title: Growth Platform Plan V2
stage: plan
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: 002-growth-platform-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [plan, publish-path, connectors, oauth, cron, encryption, phase-gate]
links:
  spec: specs/002-growth-platform-core/spec.md
  ticket: (none)
  adr: (none — two suggested)
  pr: (none)
files:
  - specs/002-growth-platform-core/plan.md
tests:
  - (none — planning document)
---

## Prompt

# Growth Platform — Plan v2.0

## 1. Strategy
Reuse v1 foundations (workspace, knowledge, research, content, approvals, leads,
audit, caps). Add analyze, strategy scoring, connectors, publisher state machine,
and learn loop. Dogfood on Lumo.

## 2. Stack
| Layer | Choice |
|-------|--------|
| App | Next.js App Router, TS strict, Tailwind |
| Auth/DB | Supabase + RLS |
| AI | Server-side provider via env |
| Queue/jobs | Vercel cron or queue for scheduled publish |
| Connectors | Official OAuth (start: LinkedIn and/or Meta) |
| Email | Transactional provider for invites + high-intent + failures |
| Host | Vercel |

## 3. Architecture
```text
Web app (team UI)
  → API (auth, workspace scope)
  → Agents (analyze, research, strategy, media, publish, leads, learn)
  → Knowledge store
  → Connector layer (OAuth tokens encrypted at rest)
  → Job runner (scheduled posts)
  → Audit + metrics tables4. Data additions (beyond v1)

workspace_settings: mode, caps, notification_email
connected_accounts: provider, tokens, scopes, status
publish_jobs: draft_id, network, scheduled_at, status, external_id, error
performance_snapshots: post_id, metrics_json, fetched_at
analyze_runs: url, summary_json
strategy_ideas: scores, evidence links

5. Phased delivery
Phase 0 — Platform core (week 1)
Auth, workspaces, invites, roles, RLS, knowledge, claims gate, audit, AI caps.
Seed Lumo workspace.
Phase 1 — Brain (week 2)
Analyze URL, research, strategy scoring, media drafts (6 networks as formats).
Approvals queue.
Phase 2 — First publish vertical (week 3–4)
One connector (prefer LinkedIn or Meta). approve_then_publish + schedule.
publish_jobs + failure handling + audit.
Phase 3 — Modes & team (week 5)
draft_only / auto_within_rules, caps, approval grants, multi-member happy path.
Phase 4 — Leads + learn (week 6)
Inbound leads (existing), notify, basic performance fetch, “next actions” report.
Phase 5 — Expand connectors (week 7–8)
Second network; draft-only for networks without API yet.
Agency: workspace switcher polish, limits.
6. Risks

























RiskMitigationAPI partner rejectionAbstract connector; drafts work without publishBrand damage auto-postDefault approve_then_publish; claim filterScope explosionOne publish network before fiveAdoptionDogfood Lumo weekly content via platform
7. Definition of done (v2.0 MVP)
Lumo workspace: claims set → analyze site → research → campaign idea →
multi-format drafts → approve → publish on ≥1 network → see job success in UI.
Second user can edit/approve per grants. Second workspace isolated.
text

## Response snapshot

Wrote `specs/002-growth-platform-core/plan.md`.

**Reconstructed the mangled paste.** The §3 code fence was never closed, so §4's data
additions and everything through §5 were swallowed into the architecture block, and §6's
risk table had collapsed into one run-together line
(`RiskMitigationAPI partner rejectionAbstract connector…`). Recovered all four
risk/mitigation pairs and every §4 table. No content was invented in those sections —
formatting only. Noted in the plan itself so the reconstruction is visible.

**Eight decisions taken where the plan offered a choice** (D1–D8):

- **D1 Vercel Cron, not a queue** — one protected route claiming due jobs under an advisory
  lock, mirroring the existing `claim_ai_run()`. At 5–50 publishes/workspace/day a queue
  earns nothing. **Surfaced a constraint the paste did not mention: Vercel Hobby cron runs at
  most daily, so scheduling needs Pro** — raised as blocking clarification B1.
- **D2 LinkedIn only in Phase 2** — the paste said "prefer LinkedIn or Meta"; the decision
  record §3 already locked the order, and LinkedIn is right because it does not gate
  publishing behind an app review queue.
- **D3 Resend** — already a v1 dependency and the only sender the guardrail allows.
- **D4 plain `fetch` behind `lib/connectors/<platform>.ts`, no vendor SDK** — the guardrail's
  whole point is that a publishing SDK cannot enter `package.json` unnoticed.
- **D5 extend `workspaces`, do not add `workspace_settings`** — *a deliberate deviation from
  the paste, flagged as such.* v1 already stores `daily_run_cap` and `notify_email` on
  `workspaces`; a settings table would split one row's configuration across two tables.
- **D6 `performance_snapshots.publish_job_id`, not `post_id`** — there is no `posts` table
  and none is proposed; the publish job owns the receipt, so metrics hang off it.
- **D7 application-level AES-256-GCM** for token material, decryption in one module,
  no SELECT policy for `authenticated`. **Wants an ADR** for key rotation and revocation.
- **D8 per-platform draft rows**, so `PublishJob = draft × connected account` and
  per-platform status falls out rather than needing special cases.

**Constitution Check: PASS with one standing condition.** Principles V, VII, and VIII all
rest on v1 mechanisms — cap reservation, RLS policies, atomic audit writes — that have never
executed against a database. Recorded as the Phase 0 hard exit gate rather than as a
Complexity Tracking violation, because it is a verification gap in inherited code, not a
design compromise.

**Added a "publish path" section** the paste did not have, because it is where the real
design risk sits: claim check on the post-edit body → cap **reservation** (not pre-check) →
job created → cron claims → connector fetch → receipt as idempotency anchor → audit. Five
load-bearing details spelled out, including that a retry re-reads the stored receipt first
and reconciles status rather than re-posting, and that auto mode adds a rule evaluator *in
front of* this path and changes nothing inside it — which is the concrete reason
approve-then-publish ships first.

**Three risks added** to the paste's four: publishing on unproven RLS/caps/audit, duplicate
posts from retries, and token leakage/staleness.

**Six blocking clarifications**, two of them new at the plan level: B1 (Vercel tier for cron
granularity) and B2 (which LinkedIn product and scopes are approved — determines whether an
organization Page is required). The other four carry forward from the spec: FR-Q-107 retry
trigger, FR-Q-109 cap clamp ceiling, FR-Q-105 metrics scope, FR-Q-106 weekly trigger.

## Outcome

- ✅ Impact: v2.0 has a HOW with every offered option resolved, a designed publish path, and
  a hard gate preventing publish work from starting on unverified foundations. Phase 0 is
  immediately actionable; Phase 2 has two named blockers that need answers first.
- 🧪 Tests: none — planning document.
- 📁 Files: `specs/002-growth-platform-core/plan.md` (new)
- 🔁 Next prompts: `/sp.tasks`; answer B1 and B2 before Phase 2; two ADRs worth writing
  (connector token encryption + key rotation; publish job state machine and cap reservation
  placement); and the actual first action — apply the six v1 migrations to a real database
  and un-skip the 53 integration tests, which is Phase 0's exit gate.
- 🧠 Reflection: the paste's "Vercel cron or queue" looked like a free choice between two
  equivalent options, but picking cron surfaces a platform-tier constraint that changes what
  can be promised about scheduling. The useful output of a plan is often the constraint the
  decision exposes, not the decision.

## Evaluation notes (flywheel)

- Failure modes observed: the mangled paste made §4 look like part of an ASCII architecture
  diagram; transcribing it as drawn would have produced a plan with no data-additions section
  at all. Two of its entries (`workspace_settings`, `post_id`) also conflicted with the
  existing schema and needed deviating from rather than copying.
- Graders run and results (PASS/FAIL): Constitution Check ran against all ten v2.0
  principles — PASS with a standing condition, no violations. No code, so no test graders.
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): `supabase start`, apply `0001_foundation.sql`,
  and run `tests/integration/rls-foundation.test.ts` alone — the smallest step that converts
  Phase 0's gate from a plan into a result.
