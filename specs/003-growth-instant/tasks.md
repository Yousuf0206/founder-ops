---
description: "Task list for Growth Instant (v3.0)"
---

# Tasks: Growth Instant

**Input**: Growth Instant — Tasks v3.0 (user-authored) + [`spec.md`](./spec.md), [`plan.md`](./plan.md)
**Governed by**: `.specify/memory/constitution.md` (Lumo Grow Constitution **v3.1.0**)

## Format and status

| Mark | Meaning |
|---|---|
| `[X]` **verified** | Proven against the hosted database by integration tests |
| `[X]` **code complete** | Written; typecheck, unit tests, guard scripts, and `next build` pass; not yet run against a database |
| `[ ]` | Not done, or needs an owner action |
| ➕ | Not in the Tasks v3.0 outline — see [Added tickets](#added-tickets) |

## Phase A — Front door

- [X] **T-A1** *(code complete)* Start page: URL + goal fields, submit — `app/(growth)/start/`
- [X] **T-A2** *(code complete)* Validate URL; write `analyze_run` — `app/api/growth/analyze/route.ts`
      plus the server action `start/actions.ts`. Runs INLINE rather than on a queue: there is
      no job runner in this app, and NFR-GI-001's <120s budget fits a request.
- [X] **T-A3** *(code complete)* Public page fetch + text extract (timeout/size limits)
      — **reuse `lib/analyze/fetch.ts`**; robots.txt, private-address guard, and size cap
      already implemented. Scope is wiring, not a new fetch layer.
- [X] **T-A4** *(code complete)* LLM: hurdles JSON (3–7 items, plain-language schema) —
      `lib/growth/analyze.ts`; ONE call returns hurdles and product facts together.
- [X] **T-A5** *(code complete)* Persist `product_facts` from extraction — `lib/facts/repo.ts`
- [X] **T-A6** *(code complete)* Hurdles UI: list + Generate pack CTA + retry —
      `app/(growth)/hurdles/page.tsx`. The CTA links to `/pack`, which Phase B still owes.
- [X] **T-A7** *(code complete)* Remove/bypass first-run `approved_claims` hard gate — **four sites, all
      required** (see plan §5):
      - `lib/prompts/assemble.ts:67` `MissingClaimSetError` — the one a silent workspace hits
      - `lib/prompts/assemble.ts:68` `EmptyApprovedClaimsError` — the claim wall proper
      - `lib/ai/run.ts:88` pre-flight refusal, before the assembler is reached
      - `lib/http/run-errors.ts:37` 409 mapping — a 409 on the first run *is* SC-02 failing
- [X] **T-A8** *(code complete)* Forbidden pattern filter utility (shared) — `findForbiddenClaims()` exists at
      `lib/prompts/assemble.ts:125` but **requires a `ClaimSet`**, which a first-run
      workspace does not have. Needs a global pattern list (guaranteed results, fake "#1",
      false certification) that runs with no claim set (`FR-GI-X-003`).
- [X] **T-A9** *(code complete)* ➕ Migration: add `hurdles jsonb` and `goal` to `analyze_runs` — the table
      exists (`0009_analyze_strategy.sql`) with v2 columns only
- [X] **T-A10** *(code complete)* ➕ Migration: create `product_facts` (+ RLS policies,
      `workspace_id` scoped) — `supabase/migrations/0016_growth_instant_facts.sql`

**DoD:** Lumo URL shows hurdles without visiting Claims.
**DoD status:** unmet — code complete and covered by unit tests
(`tests/unit/growth-instant.test.ts`, 22 cases), but `0016` has never been applied to a
database and no integration test has run against one. Same verification gap as Phase 0.

### Phase A decisions taken provisionally

Open decisions 3 and 5 blocked Phase A, so each was settled the conservative way and the
choice is recorded where the code makes it, not only here:

| # | Taken as | Where |
|---|---|---|
| 3 | A user with any membership reuses their most recent workspace; only a user with none gets one created silently. Never creates a second workspace behind the user's back. | `lib/growth/workspace.ts` |
| 5 | Goal `other` is an inert label — stored, never interpolated into a prompt as free text. | `lib/growth/analyze.ts`, `0016` check constraint |

Decision 1 (pack storage) still blocks Phase B and was NOT settled here.

## Phase B — Pack

> **Blocked on plan Open Decision 1** — whether pack posts reuse `content_drafts` (already
> wired to `publish_jobs` and the state machine) or get new tables. T-B4 and most of Phase C
> change shape depending on the answer.

- [ ] **T-B1** API generate growth pack from `analyze_run` + facts + goal
- [ ] **T-B2** Schema: angles (≥3), posts (≥5), week plan
- [ ] **T-B3** Pack UI: edit text, checkbox select posts
- [ ] **T-B4** Save `pack_posts` statuses as draft
- [ ] **T-B5** Empty/fail states if generation fails (no partial silent success)

**DoD:** One click from Hurdles yields an editable pack.

## Phase C — Publish

- [ ] **T-C1** LinkedIn OAuth connect from Publish section — **reuse the existing connector**
      (`lib/connectors/linkedin/oauth.ts`, `publish.ts`, callback route). Integration only.
- [ ] **T-C2** Approve selected posts
- [ ] **T-C3** Publish job + claim/forbidden check on final body
- [ ] **T-C4** Show published/failed per post
- [ ] **T-C5** Idempotent receipt handling (reuse existing if present)
- [ ] **T-C6** ➕ Enforce Instagram draft-only (`FR-GI-U-006`): IG variants generate and edit
      but MUST NOT become approvable, schedulable, or publishable, and MUST NOT count against
      the daily cap

**DoD:** Real LinkedIn publish from a pack post.

## Phase D — Next + Advanced

- [ ] **T-D1** Next screen: receipts + 3 next actions
- [ ] **T-D2** Re-analyze / new pack entry points
- [ ] **T-D3** Advanced: edit `product_facts`
- [ ] **T-D4** Hide ops-heavy nav from default shell (5-screen IA) — decide the fate of the
      ~15 existing `(ops)` routes (plan Open Decision 2): move under `/advanced/*`, leave
      unlinked, or delete
- [ ] **T-D5** E2E dogfood script: lumo-learn.com full path — **no browser-level harness
      exists** (vitest only: `tests/{unit,integration,helpers,stubs}`). Either add one or
      define this as a scripted manual run.
- [ ] **T-D6** Basic analytics events: `started`, `hurdles_ready`, `pack_ready`, `published`
      — greenfield; no event pipeline exists today. `audit_logs` and `ai_run_logs` exist but
      serve compliance, not funnel measurement. Spec §7's `event_log` is a new table.
- [ ] **T-D7** ➕ Mobile pass on the five main screens (`NFR-GI-003`)

**DoD:** SC-01–SC-06 pass on staging/production.

## Non-tasks (MVP)

Explicitly not built. Listed without checkboxes so they are never mistaken for backlog.

- Mandatory Knowledge wiki step
- `auto-within-rules` as default
- Meta / TikTok / X / YouTube publish (draft templates OK)
- Cold lead generation

## Added tickets

➕ tickets are not new scope — each closes a gap between the Tasks v3.0 outline and a
requirement already in `spec.md`.

| Ticket | Why it was added |
|---|---|
| T-A9, T-A10 | T-A5 persists `product_facts` and T-A4 writes hurdles, but neither table/column exists. Without migrations the phase cannot start. |
| T-C6 | `FR-GI-U-006` (IG draft-only until Meta) had no ticket. Without it, generated IG posts fall into the normal publish path. |
| T-D7 | `NFR-GI-003` (mobile-usable main path) had no ticket. |

## Open decisions blocking work

| # | Decision | Blocks |
|---|---|---|
| 1 | Reuse `content_drafts` for pack posts, or new tables? *(plan recommends reuse)* | T-B4, T-C2–C5 |
| 2 | Fate of the ~15 existing `(ops)` routes | T-D4 |
| 3 | Workspace select rule (`FR-GI-S-003`) | T-A10 — decides if `product_facts` is per-workspace or per-run |
| 4 | Default daily cap for a silently-created workspace | T-C3 |
| 5 | Goal `other` — free text or inert label | T-A1, T-B1 |
| 6 | Meta "already available" trigger | T-C6 |

Decisions 1 and 3 shape the schema; settle them before Phase B opens.

---

## Work order 2026-09-17 — P0/P1/P2

### Open decisions, settled

| # | Decision | Settled as |
|---|---|---|
| 1 | Reuse `content_drafts` for pack posts | **Reuse.** `content_drafts.source = 'growth_pack'` + `growth_pack_id` (migration 0017). Approval, the forbidden check at publish, the daily cap, the publish job and its receipt already exist for `content_drafts`; a parallel table would have needed its own copy of each, and the copies would have drifted. |
| 2 | Fate of the ~15 `(ops)` routes | **Kept, demoted.** They stay in full under Advanced. The old `/` ops console moved to `/advanced`; `/` is now a router into `/start`. Their nav is labelled Advanced destinations and may not be promoted (SC-06). |
| 5 | Goal `other` — free text or inert label | **Free text, injected.** `analyze_runs.goal_note`, ≤120 chars, shown only when `other` is chosen, and written into both the analyze prompt and the pack prompt. Stored-but-ignored was explicitly rejected. |
| 6 | Meta "already available" trigger | **`LIVE_PUBLISH_PLATFORMS`** in `lib/connectors/registry.ts`, via `isPublishablePlatform()`. Instagram becomes publishable the day it joins that list and not before — there is no second flag to forget. |

Decisions 3 (workspace select) and 4 (default cap) were already settled in code and are unchanged.

### P0 — why the dogfood URL failed

Not extraction. `https://lumo-learn.com` fetches cleanly and yields ~7,100 characters of
readable text through `extractText`, and its robots.txt allows `/`.

The failure was a **bootstrap deadlock**. `runGeneration` refused any prompt not bound to
approved claims or stored `product_facts` — including the Growth Instant analysis, which is
the run that *creates* those facts. A first run could therefore never succeed. The refusal
(`MissingClaimSetError`) was then mapped on Start to *"We could not read enough from that
page to work with"*, which blamed the founder's page for a gate that had never let the run
start.

Fixed by `KnowledgeContext.allowUnbound`, set by `lib/growth/analyze.ts` and nowhere else.
The exemption is one run wide: the page text in the user message is that run's source of
product truth, the global forbidden block is still injected, and `dropForbiddenHurdles`
still runs on the output. Every other generation path is unchanged.

Also in P0:

- The thin-page check moved **before** the provider call, so an unanalysable page costs no
  cap slot and gets its own sentence instead of a downstream schema failure.
- `extractText` falls back to `og:title` / `og:description`, so a client-rendered marketing
  page with an empty `<body>` is still analysable.
- A sparse body is declared in the prompt, so the model reports "almost nothing renders
  without JavaScript" as a hurdle rather than inventing a product to fill the gap.
- The Start error for a gate refusal now says it is a bug on our side, and logs it.

### Manual production check

Run signed in, against production, after each deploy that touches this path.

1. Sign in at https://lumo-ops.vercel.app/ — landing should be `/start`, not the ops console.
2. The page must not ask for claims, knowledge, or a workspace form before the URL field.
3. Paste `https://lumo-learn.com`, leave the goal unset, submit.
4. Expect `/hurdles` with 3–7 hurdles naming things actually on that page.
   - *"We could not read enough from that page"* here means the analysis was refused, not
     that the page was thin — check `ai_run_logs` and the `analyze_runs.error` column.
5. Press **Generate growth pack** on Hurdles. Expect `/pack` with 2–4 angles and ≥5 posts.
6. Instagram posts must carry the draft-only badge; LinkedIn posts must not.
7. Edit one post, save, reload — the edit persists and the post shows as `edited`.
8. Confirm at `/advanced` that the next step is no longer "Add approved claims".

Migration 0017 must be applied before steps 5–7; until then `/pack` renders its empty state
rather than failing.
