---
description: "Task list for Growth Platform Core (v2.0)"
---

# Tasks: Growth Platform Core

**Input**: Growth Platform — Tasks v2.0 (user-authored) + `spec.md`, `plan.md`
**Governed by**: `.specify/memory/constitution.md` (Lumo-Ops Constitution **v2.0.0**)
**Decisions**: [decisions-2026-09-15.md](./decisions-2026-09-15.md) wins on conflict with this file.

## Format and status

`[ID] [P?] [Story] Description`. **[Story]** is a spec.md user story (US1–US9) or `SYS`.
**➕** marks a task not in the Tasks v2.0 outline — see [Changes from the outline](#changes-from-the-outline).

| Mark | Meaning |
|---|---|
| `[X]` **verified** | Proven against the hosted database by integration tests |
| `[X]` **code complete** | Written; typecheck, unit tests, guard scripts, and `next build` pass; **not yet run against a database** |
| `[ ]` | Not done, or needs an owner action |

**Status 2026-09-16.** All code for Phases 0–4 and the buildable parts of Phase 5 is written.
Checks: `tsc` clean · 157/157 unit tests · `check:publish-guards` and `check:public-env` pass ·
`next build` passes. **Migrations `0008`–`0015` applied by the owner.** All 8 integration
files pass against the hosted project (120 tests): publish path, auto mode, plans and
settings, function grants (0015 closes the anon hole), and isolation across 20 tables.
The database behaviour of the Phase 1–4 items below is now proven; screens, the LinkedIn
call itself, and AI generation still need a real run with credentials.

### Migrations (applied 2026-09-16)

| Migration | Contents | Note |
|---|---|---|
| `0015_lock_down_system_functions.sql` | **Security fix** — revokes anon/authenticated EXECUTE on v1's service-only functions | **Standalone (needs only 0005). Apply first, now.** Verified exploitable on the hosted project |
| `0008_plans_and_settings.sql` | Plans, workspace settings, creation under plan limit | Then apply in order ↓ |
| `0009_analyze_strategy.sql` | Analyses, scored ideas | |
| `0010_connectors.sql` | Connected accounts (sealed tokens) | |
| `0011_publish.sql` | Publish jobs: enqueue, claim, finish | |
| `0012_publish_actions.sql` | Retry, cancel, disconnect; **drops `mark_draft_published`** | Deploy the matching app code at the same time |
| `0013_modes_auto_team.sql` | Auto rules, last-owner guard, seat limit | |
| `0014_leads_learn.sql` | Lead tasks, metrics, learn summaries, proposals | |

Migration numbers start at `0008` because `0007` exists; this supersedes the numbering in plan.md "Schema".

---

## Phase 0 — Core (week 1)

**Exit gate (hard)**: T0.11 green. No Phase 2 in production before it (decisions §9).

- [X] **T0.1** [SYS] App shell + Supabase auth — **verified** (inherited)
- [X] **T0.2** [US7] workspaces, memberships, invites, RLS — **verified** (inherited)
- [X] **T0.3** [US1] Block AI with no approved claims — `EmptyApprovedClaimsError` in `lib/prompts/assemble.ts`; lead classification checks before reserving a run — **code complete**, unit-tested
- [X] **T0.4** [US7] Roles + approval grant flag — **verified** (inherited)
- [X] **T0.5** [SYS] AI run cap, 50/day UTC — **verified** incl. concurrency (inherited)
- [X] **T0.6** [SYS] Audit log — **verified** (inherited)
- [ ] **T0.7** [US1] Seed Lumo + forbidden starter claims — **workspace done 2026-09-16**: existing `lumo-learn` (id `9a59f0a1…`) upgraded to the `team` plan, owner yousuf_saleem@lumo-learn.com. Claim set seeded the same day: 16 forbidden starter claims + brand voice. Still open: approved claims, written by the team at /knowledge/claims. A duplicate `lumo-learn-com` workspace remains on `solo`, untouched
- [X] **T0.8** ➕ [SYS] Test database — the integrated hosted project (owner's choice); `TEST_SUPABASE_ALLOW_APP_PROJECT=true` opt-in in `tests/helpers/supabase.ts`
- [X] **T0.9** ➕ [SYS] `0008_plans_and_settings.sql` — **code complete**
- [X] **T0.10** ➕ [P] [SYS] `lib/plans/entitlements.ts` + `DEFAULT_PLAN` — **code complete**, unit-tested
- [X] **T0.11** ➕ [SYS] **Gate — PASSED 2026-09-16.** Schema `0001`–`0015` on the hosted project: all 8 integration files green (`caps-and-approvals`, `rls-foundation`, `rls-knowledge`, `rls-full-isolation` over 20 tables, `plans-and-settings`, `publish-path`, `auto-mode`, `function-grants`). One test bug fixed on the way (a multi-row insert sends null, not the default, for a column missing from one row). A network timeout during one cleanup left 3 test users, which were deleted; the project is back to its 2 real users and 2 workspaces
- [ ] **T0.12** ➕ [P] Owner action: submit Meta app review + business verification

## Phase 1 — Brain (week 2)

- [X] **T1.1** [US1] Onboarding: niche, URL, goals, tone; creation via `create_workspace_with_owner()` under the plan's workspace limit — **code complete**
- [X] **T1.2** [US1] `0009_analyze_strategy.sql` — **code complete**
- [X] **T1.3** ➕ [P] [US1] `lib/analyze/fetch.ts` — SSRF checks on every hop, robots.txt before the request — **code complete**, 32 unit tests
- [X] **T1.4** [US1] Analyze agent, route, and pages — **code complete**
- [X] **T1.5** [US8] Research with Fact / Inference / Hypothesis — inherited, unchanged
- [X] **T1.6** [US8] Scored strategy ideas; evidence quotes verified against the source — **code complete**, unit-tested
- [X] **T1.7** [US3] Six-platform package, one run, one draft per platform — **code complete**
- [X] **T1.8** [US3] Forbidden-claim scan across every platform's asset — **code complete**
- [X] **T1.9** [US4] Approvals inbox — inherited, unchanged
- [X] **T1.10** ➕ [P] [US3] Draft-only notice where no connector is live — **code complete**
- [X] **T1.11** ➕ [SYS] Isolation test covers the Phase 1 tables — **code complete**

## Phase 2 — Publish vertical: LinkedIn (weeks 3–4)

- [X] **T2.1** [US2] `0010_connectors.sql` — token columns not readable by `authenticated` — **code complete**
- [X] **T2.2** ➕ [P] [US2] `lib/connectors/tokens.ts` — AES-256-GCM, account-bound AAD — **code complete**, unit-tested
- [X] **T2.3** [US2] OAuth connect flow with signed, expiring state — **code complete**, unit-tested
- [X] **T2.4** [US2] `lib/connectors/linkedin/` — plain fetch, error taxonomy — **code complete**, unit-tested with mocked fetch
- [X] **T2.5** ➕ [US4] `0011_publish.sql` — publish jobs, cap reserved at execution — **code complete**
- [X] **T2.6** [US4] State machine (DB + `lib/publish/state.ts`) — **code complete**, unit-tested
- [X] **T2.7** [US4] Claim check on the final body before enqueue, in the database — **code complete**
- [X] **T2.8** ➕ [US4] `lib/publish/execute.ts` — the only platform write path — **code complete**
- [X] **T2.9** [US4] Publish now — **code complete**
- [X] **T2.10** [US4] Schedule via cron (`vercel.json` daily until B1) + "Run due jobs now" — **code complete**
- [X] **T2.11** [US4] Job status, errors, human-triggered retry, cancel (`0012_publish_actions.sql`) — **code complete**
- [X] **T2.12** ➕ [SYS] `check-publish-guards.mjs` replaces `check-no-publish.mjs` — **passing**
- [X] **T2.13** ➕ [US4] v1 manual "mark published" removed from DB (`0012`), API, and UI — **code complete**
- [X] **T2.14** ➕ [US2] Disconnect / revoked token → blocked or failed, team notified — **code complete**
- [X] **T2.15** ➕ [US4] `tests/integration/publish-path.test.ts` — **written, not yet run**

**DoD still unmet**: a real LinkedIn post needs a LinkedIn app (B2), `CONNECTOR_TOKEN_KEY`,
`LINKEDIN_*`, and `CRON_SECRET` set on the server.

## Phase 3 — Modes & scale controls (week 5)

- [X] **T3.1** [US2] Owner-only mode selector at `/settings/modes`; switching to `draft_only` blocks scheduled jobs at execution — **code complete**
- [X] **T3.2** [US2] Publish cap UI, clamp `1…min(30, plan)` — **code complete** (FR-Q-109 still open)
- [X] **T3.3** [US5] `lib/publish/rules.ts` — **code complete**, 13 unit tests
- [X] **T3.4** [US5] `enqueue_auto_publish_job()` + `lib/publish/auto.ts`; rule-attributed approval; forbidden claim → human review — **code complete**
- [X] **T3.5** ➕ [US2] Per-account auto toggle, timezone, window, days, confidence gate — **code complete**
- [X] **T3.6** [US7] Member removal; last-owner guard (0013) — **code complete**
- [X] **T3.7** ➕ [US5] `tests/integration/auto-mode.test.ts` (SC-006) — **written, not yet run**

**DoD**: modes documented on `/help` — done. "Auto cannot exceed caps" — proven once T3.7 runs.

## Phase 4 — Leads & learn (week 6)

- [X] **T4.1** [US9] Ingest + score + high-intent email; high intent is now score ≥ 70 — **code complete**
- [X] **T4.2** [US9] Lead tasks; high-intent leads get a "contact manually" task automatically — **code complete**
- [X] **T4.3** [US6] Metrics on demand; LinkedIn member-post analytics recorded as unavailable, never estimated — **code complete**
- [X] **T4.4** [US6] Learn summary; uncited findings dropped — **code complete**, unit-tested
- [X] **T4.5** [US6] Knowledge proposals, applied only on accept — **code complete**
- [X] **T4.6** ➕ [US6] Home shows the loop and the next step — **code complete**
- [X] **T4.7** ➕ [US4] A forbidden claim added after publish flags the post in the audit log — **code complete**

## Phase 5 — Expand (weeks 7–8)

- [ ] **T5.1** [US2] Meta connector — **blocked** on T0.12. Not written: Instagram publishing needs hosted media and approved permissions that cannot be verified before review
- [X] **T5.2** [US3] Drafts for networks without publish — six-platform drafts + draft-only notice
- [X] **T5.3** [SYS] Plan limits — workspaces at creation (0008), seats at invitation acceptance (0013); lowered limits refuse new, keep existing — **code complete**
- [ ] **T5.4** Owner action: two weeks of Lumo content through the platform
- [X] **T5.5** ➕ [SYS] Switcher — inherited; every query is scoped to the active workspace, none aggregate

**DoD**: SC-001–009 signed off — pending T0.11, a real publish, and T5.4.

---

## Decisions taken by default (change any of them)

| Open question | Default built | Where |
|---|---|---|
| **B1** Vercel tier | Daily cron (Hobby-safe) + "Run due jobs now" button | `vercel.json` |
| **B2** LinkedIn product | Member posting: `openid profile w_member_social`; no organization pages | `lib/connectors/linkedin/oauth.ts` |
| **FR-Q-105** Metrics | On demand; LinkedIn member analytics stated as unavailable | `lib/learn/metrics.ts` |
| **FR-Q-106** Weekly summary | On demand only | `lib/learn/summary.ts` |
| **FR-Q-107** Retry policy | Human-triggered only; unknown outcomes are never re-posted automatically | `0011`, `0012`, `/publish` |
| **FR-Q-109** Cap ceiling | `min(30, plan limit)` | `0008` |
| Mode → `draft_only` with jobs scheduled | Jobs become `blocked` at execution | `claim_publish_job()` |
| Workspace limit is per person | Allowance = most generous plan among workspaces they own | `create_workspace_with_owner()` |
| LinkedIn API version | Required env var; no default guessed | `LINKEDIN_API_VERSION` |

## Changes from the outline

| Change | Why |
|---|---|
| Inherited v1 work marked verify-only | Conformance audit §3: rebuilding would discard working code |
| T0.3 refuses on an empty approved list | Decisions §7 (v1 allowed it) |
| T0.8, T0.11 gate added | Decisions §9: integration tests green on a real database |
| Plan limits start in Phase 0 | Lumo seeds as team; solo must refuse auto; onboarding needs the limit |
| T1.3 SSRF-safe fetch | The server fetches user-supplied URLs |
| Cap enforcement moved into Phase 2 | Constitution V: no publish without a cap |
| T2.8, T2.12–T2.15 added | Single write path, guard rewrite, v1 manual publish removed, failure handling, proof |
| **Security fix `0015` added** | v1 service-only functions were callable with the anon key (verified on the hosted project) |
| Migrations renumbered from `0008`; publish split into `0011` + `0012` | `0007` exists; the 500-line file rule |
| Phase 5 DoD → SC-001–009 | spec.md defines nine |

## Non-tasks (v2.0)

- Cold email/DM scraping sequences
- Guaranteed KPI contractual claims in-product
- Building all six publish APIs before first real publish
- Posting to accounts the workspace does not own
- Full ad-bid management
