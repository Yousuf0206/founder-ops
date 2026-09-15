# Implementation Plan: Growth Platform Core

**Branch**: `002-growth-platform-core` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)
**Input**: Growth Platform — Plan v2.0 (user-authored) + `specs/002-growth-platform-core/spec.md`

> HOW we build it. WHAT is in `spec.md`. Tickets in `tasks.md`.
> Governed by `.specify/memory/constitution.md` (Lumo-Ops Constitution **v2.0.0**).
> Decisions locked by [decisions-2026-09-15.md](./decisions-2026-09-15.md) — **that file
> wins on conflict** with anything here.

> *Reconstruction note: the Plan v2.0 paste arrived with an unclosed code fence (§3's
> architecture block swallowed §4) and a collapsed risk table. Both were reconstructed from
> the run-together text; §6's four risk/mitigation pairs are recovered below. Nothing was
> added to those sections beyond formatting.*

## Summary

Extend the existing v1 codebase rather than starting over. The workspace, knowledge, claim,
research, content, approval, lead, audit, and cap layers are already written — what is
missing is everything downstream of a draft: analysis of a public URL, scored strategy
ideas, an OAuth connector layer, a publish state machine with a job runner, and a learn
loop that feeds metrics back into knowledge proposals.

The load-bearing change versus v1 is that this app now performs outbound writes to
third-party platforms. Every architectural decision below is shaped by that: tokens
encrypted at rest, one publish module no other code may bypass, cap reservation before the
platform call, and a receipt used as the idempotency anchor so a retry cannot double-post.

**Dogfood on Lumo Learn**, seeded as a `team` plan workspace so auto mode can be exercised.

## Technical Context

**Language/Version**: TypeScript 5.x strict; Node 20 (Vercel runtime)
**Primary Dependencies**: Next.js 15 App Router, Tailwind, `@supabase/supabase-js` +
`@supabase/ssr`, Zod, Resend; **new**: one LinkedIn API client or plain `fetch` (see D4)
**Storage**: Supabase Postgres, RLS + `force row level security` on every table
**Testing**: Vitest — unit for prompt assembly, validators, rule evaluation, and cap maths;
integration against a real local Supabase for RLS, caps, audit, and publish state
**Target Platform**: Vercel (web, server routes, cron)
**Project Type**: Web application — single Next.js app, server routes as the only backend
**Performance Goals**: p95 draft generation under 60s when the provider allows; a scheduled
publish fires within one cron tick of its `scheduled_at`
**Constraints**: No secret or OAuth token reaches the browser; zero cross-workspace reads;
publish cap 5/day aggregate (plan-dependent) enforced as a reservation; AI run cap per plan
**Scale/Scope**: B2B multi-tenant — solo 1 workspace to business 20; ~19 tables after this
feature (13 inherited + 6 new); ~14 screens

### Decisions taken where the plan offered options

| Open choice in Plan v2.0 | Decision | Why |
|---|---|---|
| **D1** — "Vercel cron **or** queue" for scheduled publish | **Vercel Cron** invoking one protected route that claims due jobs under an advisory lock, exactly as `claim_ai_run()` already does for AI caps | No new infrastructure, and the claim-and-reserve pattern is already written and (once Phase 0 passes) proven. A queue earns its keep when throughput or fan-out demands it; at 5–50 publishes/workspace/day it does not. **Constraint: Vercel Hobby allows only daily cron invocations — scheduling needs the Pro tier. See B1.** |
| **D2** — "Official OAuth (start: LinkedIn **and/or** Meta)" | **LinkedIn only** in Phase 2; Meta in Phase 5 | Decision record §3 locks the order, and it is the right one: LinkedIn does not gate publishing behind an app review queue, so Phase 2 cannot be blocked by someone else's turnaround. Meta review starts in parallel during Phase 0–1. |
| **D3** — "Transactional provider" for email | **Resend** — already a v1 dependency and the only sender allowed past the guardrail script | Adding a second sender would mean widening the bulk-messaging block for no gain. |
| **D4** — connector client library | **Plain `fetch` behind `lib/connectors/<platform>.ts`**, no vendor SDK | The guardrail script's whole purpose is that a publishing SDK cannot enter `package.json` unnoticed. `fetch` behind one interface keeps the publish path greppable and keeps the allowlist empty. Revisit only if a platform requires a signed-request scheme that is unreasonable to hand-roll. |
| **D5** — `workspace_settings` as a new table (Plan §4) | **Extend `workspaces` instead** | v1 already stores `daily_run_cap` and `notify_email` **on `workspaces`**. A `workspace_settings` table would split one row's settings across two tables and require a join or a trigger to keep them honest. New columns: `timezone`, `publish_mode`, `daily_publish_cap`, `auto_enabled`, `auto_window_start`, `auto_window_end`, `auto_days`, `plan`. *This deviates from the plan paste — flagged, not silent.* |
| **D6** — `performance_snapshots.post_id` (Plan §4) | **`publish_job_id`** referencing `publish_jobs` | There is no `posts` table and none is proposed; the publish job is what owns the platform receipt, so metrics hang off it. |
| **D7** — token encryption at rest | **Application-level AEAD** (AES-256-GCM) with the key from a server-only env var; ciphertext + nonce stored in `connected_accounts`; plaintext never selected into any view | Keeps decryption in one server module, mirrors the existing "provider keys live in one place" rule, and avoids depending on a Supabase crypto extension being enabled. **Wants an ADR** — key rotation and the revocation path are the parts worth writing down. |
| **D8** — 6 networks "as formats" (Plan §5, Phase 1) | Per-platform **draft formatter** rows in one `content_drafts` table, one draft per platform target | Matches spec FR-M-003 (native length/tone, not one body reused) and makes `PublishJob` = draft × connected account fall out naturally, which is what gives per-platform status for free. |

## Constitution Check

*GATE: must pass before Phase 0, re-checked after each phase.*

| # | Principle | How this plan satisfies it | Verified by |
|---|---|---|---|
| I | Product truth first | Knowledge + claims + voice per workspace, inherited from v1 unchanged | 15 passing unit tests on prompt assembly |
| II | No invented product facts | `assembleSystemPrompt()` requires the claim set and throws without it; analysis output labels Fact/Inference/Hypothesis and states unknowns as unknown | Unit test: assembly throws with no claim set; analysis schema requires a label per claim-bearing statement |
| III | Distribution in scope, connected accounts only | Publish resolves its target from a `connected_accounts` row, never from request input — the same rule the lead-ingest route already applies to its secret | Integration test: publish to a non-connected or foreign-workspace account is refused |
| IV | Humans set the mode | `workspaces.publish_mode` is NOT NULL with default `approve_then_publish`; owner-only to change; no publish path reads a mode from anywhere else | Migration constraint + integration test per mode |
| V | Auto-publish never bypasses guardrails | One `lib/publish/execute.ts`; it runs the claim check on the final body and reserves the publish cap **before** the platform call, in every mode | Integration test at the cap boundary under concurrency; seeded-forbidden-phrase test in auto mode |
| VI | No cold spam | Leads stay inbound-only and unchanged from v1; the bulk-messaging block in the guardrail script is retained when it is rewritten | Guardrail script CI run; code review |
| VII | Workspace isolation absolute | `workspace_id` on all six new tables with policies in the same migration; `connected_accounts` tokens unreadable by `authenticated` at all | RLS integration tests extended to 19 tables |
| VIII | Everything audited | Every publish job writes an audit row with actor (`user:<id>` or `rule:<id>`), mode, target account, claim-check result, outcome; auto publishes additionally write an approval row | Integration test per mode, including the auto path |
| IX | One platform, 1→N teams | Roles and `can_approve` inherited; plan entitlements gate seats and workspaces | Multi-member happy path (Phase 3) |
| X | Dogfood | Lumo Learn seeded as a `team` workspace in Phase 0 and used for weekly content from Phase 2 | Definition of Done §7 |

**Result: PASS with one standing condition** — Principles V, VII, and VIII all rest on v1
mechanisms (cap reservation, RLS policies, atomic audit writes) that **have never executed
against a database**. They are reviewed, not proven. This is not a Complexity Tracking
violation; it is the Phase 0 exit gate below, and no publish work may start before it clears.

## Project Structure

### Documentation (this feature)

```text
specs/002-growth-platform-core/
├── spec.md                      # WHAT (written)
├── decisions-2026-09-15.md      # Locked decisions — authoritative
├── plan.md                      # This file
├── data-model.md                # Phase 1 output — new tables, columns, RLS policies
├── quickstart.md                # Phase 1 output — local Supabase, env, connector setup
├── contracts/                   # Phase 1 output — request/response shapes per route
└── tasks.md                     # Phase 2 output (not created by plan)
```

### Source Code (repository root) — additions to the v1 tree

```text
app/
  (ops)/
    analyze/                  # NEW — URL analysis runs and reports
    strategy/                 # NEW — scored campaign ideas
    publish/                  # NEW — queue, schedule, per-platform status
    settings/connections/     # NEW — OAuth connect/disconnect, per-network auto flags
    settings/modes/           # NEW — publish mode, caps, timezone, auto window
    insights/                 # NEW — metrics and "what worked"
  api/ops/
    analyze/run/              # NEW
    strategy/run/             # NEW
    publish/[jobId]/          # NEW — enqueue, cancel, retry
    connections/[platform]/   # NEW — OAuth start + callback
    cron/publish-due/         # NEW — Vercel Cron target, protected by a shared secret
    cron/metrics-pull/        # NEW — Phase 4
lib/
  connectors/                 # NEW — per-platform fetch clients + token refresh
    linkedin.ts               #   Phase 2
    meta.ts                   #   Phase 5
    tokens.ts                 #   AEAD encrypt/decrypt, refresh, revocation (D7)
  publish/
    execute.ts                # NEW — THE only path to a platform write
    rules.ts                  # NEW — auto-mode rule evaluation (Phase 3)
    caps.ts                   # NEW — publish cap reservation
  analyze/                    # NEW — fetch + robots check + summarize
  strategy/                   # NEW — idea scoring, evidence linking
  learn/                      # NEW — metrics ingest, what-worked, knowledge proposals
  plans/                      # NEW — plan entitlement lookup and enforcement
scripts/
  check-publish-guards.mjs    # REPLACES check-no-publish.mjs, in the Phase 2 slice
supabase/migrations/
  0007_platform_settings.sql  # workspaces columns + plans (D5)
  0008_connectors.sql         # connected_accounts
  0009_publish.sql            # publish_jobs + cap reservation function
  0010_analyze_strategy.sql   # analyze_runs, strategy_ideas
  0011_learn.sql              # performance_snapshots, knowledge_proposals
```

**Structure Decision**: unchanged from v1 — single Next.js app at the repository root,
server routes as the only backend. `lib/connectors` and `lib/publish` are server-only and
must never be imported from a client component; that is the same rule `lib/db` and `lib/ai`
already carry, and the guardrail script is what makes it checkable.

## The publish path (the part worth designing carefully)

Every publish, in every mode, takes exactly one route:

```text
draft (final body, post-edit)
  → claim check            ← fails: no job is created; violation audited
  → cap reservation        ← fails: no job is created; refusal audited
  → publish_job created    (status: approved | scheduled)
  → job runner (cron)      ← claims due jobs under advisory lock
  → connector fetch        ← per platform, token decrypted in lib/connectors/tokens.ts
  → receipt stored         ← external_id = idempotency anchor
  → audit row + status     (published | failed)
```

Load-bearing details:

1. **The claim check runs on the body as it will be posted**, after any reviewer edit
   (decisions §7). Checking the model's original output would leave the edited body unchecked.
2. **The cap is reserved, not pre-checked.** Two concurrent publishes at the boundary must
   not both pass. `claim_ai_run()` is the precedent; `claim_publish_slot()` mirrors it.
3. **The cap counts on execution day, not approval day** (decisions §5), so a job approved
   Monday and scheduled Thursday consumes Thursday's allowance.
4. **A retry reuses the same `publish_job` id** and re-reads the stored receipt first. If a
   receipt exists, the platform already accepted the post and the retry only reconciles
   status — it never re-posts, and it never double-counts the cap.
5. **Auto mode adds `lib/publish/rules.ts` in front of this path and changes nothing inside
   it.** That is the entire reason approve-then-publish ships first.

## Schema (implementation order)

1. `0007` — `workspaces` new columns + `plans` entitlements (D5)
2. `0008` — `connected_accounts` (encrypted token material, per-network `auto_enabled`)
3. `0009` — `publish_jobs` + `claim_publish_slot()`
4. `0010` — `analyze_runs`, `strategy_ideas`
5. `0011` — `performance_snapshots`, `knowledge_proposals`

**RLS rule** (unchanged from v1): a row is readable or writable only where a `memberships`
row links the caller to that row's `workspace_id`. Policies ship in the same migration as
the table they protect.

**One addition to the v1 rule**: `connected_accounts` token columns have **no** SELECT
policy for `authenticated` at all. They are readable only by `SECURITY DEFINER` functions
and server code holding the service role — the same treatment `ai_run_logs` and
`audit_logs` already get for writes.

## Phased delivery

Phases and ordering are locked by decisions §9. Weeks are from Plan v2.0 §5.

| Phase | Week | Contents | Exit condition |
|---|---|---|---|
| **0 — Platform core** | 1 | Auth, workspaces, invites, roles, RLS, knowledge, claims gate, audit, AI caps, plan entitlements. Seed Lumo Learn as `team`. | **Hard gate:** migrations applied to a real database and **all 53 skipped integration tests un-skipped and passing.** |
| **1 — Brain** | 2 | Analyze URL (robots-respecting), research, strategy scoring, per-platform media drafts for all six networks, approvals queue | A scored idea produces per-platform drafts with no forbidden claim |
| **2 — First publish vertical** | 3–4 | LinkedIn connector, `approve_then_publish`, schedule, `publish_jobs`, failure handling, publish audit, **guardrail script rewritten in this slice** | SC-003: real publish to LinkedIn with a receipt visible in the UI |
| **3 — Modes & team** | 5 | `draft_only`, `auto_within_rules` + rule evaluation, caps UI, approval grants, multi-member happy path | SC-006: auto respects caps and claims under concurrency, with `rule:<id>` attribution |
| **4 — Leads + learn** | 6 | Inbound leads (inherited), notifications, metrics fetch, "next actions" report, knowledge proposals | A published item shows a metric or a stated absence |
| **5 — Expand connectors** | 7–8 | Meta (Facebook Page + Instagram); draft-only for networks without access; agency switcher polish and plan limits | Second network publishes; first network unaffected |

**Phase 0 is not a formality.** Six migrations have never been applied to any database and
53 integration tests have never executed. Syntax errors, policy mistakes, and ordering
problems all surface on first apply. Until that is done, every isolation, cap, and audit
guarantee in this plan is a code review, and the publish path is exactly the wrong thing to
stack on top of a code review.

**Meta review starts week 1**, in parallel, because it is waiting time rather than work.

## Prompt policy

Unchanged from v1 and extended, not replaced. Every system prompt is assembled by
`lib/prompts/assemble.ts`, which takes the claim set as a required argument and throws
without one. New agents (analyze, strategy, learn) go through the same function — a new
generation path that builds its own prompt is a defect.

New standing instructions for the new agents:

- **analyze**: label every claim-bearing statement Fact | Inference | Hypothesis; state
  unknowns as unknown; never infer a product fact from a competitor's page.
- **strategy**: every idea carries an evidence reference; an idea with no evidence is not
  emitted.
- **learn**: propose knowledge edits; never apply them.

## Risks

*Reconstructed from the collapsed §6 table, plus the three this plan adds.*

| Risk | Mitigation |
|---|---|
| API partner rejection | Abstract the connector behind `lib/connectors/*`; drafting works with no connector at all, so a rejection costs a network, not the product |
| Brand damage from auto-post | Default `approve_then_publish`; auto gated to team/business plans; claim filter on the final body; caps as reservations |
| Scope explosion | One publish network before five — LinkedIn ships and is used before Meta starts |
| Adoption | Dogfood: Lumo Learn's weekly content goes through the platform from Phase 2 |
| **Publishing on unproven RLS/caps/audit** | Phase 0 hard gate: 53 integration tests green on a real database before Phase 2 |
| **Duplicate posts from retries** | Receipt as idempotency anchor; a retry reconciles rather than re-posts; same job id never double-counts the cap |
| **Token leakage or stale tokens** | AEAD at rest (D7), no SELECT policy for `authenticated`, decryption in one module, revocation path fails the job loudly rather than silently |

## Definition of Done (v2.0 MVP)

On the Lumo Learn workspace, end to end:

1. Claims set recorded
2. Analyze the Lumo site → stored analysis
3. Research → ranked, labelled opportunities
4. Campaign idea scored with evidence links
5. Multi-format drafts across the six networks
6. Approve one
7. **Publish to LinkedIn**
8. See the job succeed, with its receipt, in the UI

Plus: a second user edits and approves per their grant; a second workspace is isolated,
proven by test (not by a default-plan account — solo allows one workspace; see spec SC-005).

## Blocking clarifications

| Question | Blocks | Needed by |
|---|---|---|
| **B1 — Vercel plan tier.** Hobby cron runs at most daily; scheduled publish needs finer granularity. Is the project on Pro, or should scheduling degrade to "publish on next visit" until it is? | Scheduled publish (D1) | Phase 2 |
| **B2 — LinkedIn API access.** Which LinkedIn product and scopes are approved for this app — personal profile posting, organization page posting, or both? Determines whether a Page is required. | The connector's shape | Phase 2 |
| **FR-Q-107 — retry policy.** Automatic with backoff, or human-triggered only? Idempotency is settled; the trigger is not. | The job runner | Phase 2 |
| **FR-Q-109 — cap clamp ceiling.** Decisions §5 clamps to 1–30/day; §6 grants business 50/day. | Plan entitlement enforcement | Before the business plan is offered |
| **FR-Q-105 — metrics scope and cadence.** Which metrics per platform; on demand or scheduled. | Metrics fetch | Phase 4 |
| **FR-Q-106 — weekly summary trigger.** What fires it, in whose clock. The workspace `timezone` column (D5) is the natural answer. | The learn report | Phase 4 |

## Complexity Tracking

No Constitution Check violations. The standing condition under the Constitution Check is a
verification gap in inherited code, not a design compromise, and it is tracked as the Phase 0
exit gate rather than as accepted complexity.
