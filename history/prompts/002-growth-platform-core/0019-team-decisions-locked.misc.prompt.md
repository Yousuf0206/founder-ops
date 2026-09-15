---
id: 0019
title: Team Decisions Locked
stage: misc
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: 002-growth-platform-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [decisions, locked, plans, caps, connectors, auto-rules, phase-ordering]
links:
  spec: specs/002-growth-platform-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/002-growth-platform-core/decisions-2026-09-15.md (new, authoritative)
  - specs/002-growth-platform-core/spec.md (propagated)
tests:
  - (none — specification documents)
---

## Prompt

# Growth Platform v2 — Team decisions

**Status:** Locked for MUST SHIP
**Date:** 2026-09-15
**Product:** Multi-workspace growth platform (Path B)
**Supersedes:** Draft-only Founder Ops as the end-state product

---

## 1. Product direction

| Decision | Detail |
|----------|--------|
| Path | **B** — research → ideas → drafts → **publish/schedule** → measure → learn |
| Users | Marketing / founder / agency **teams** (not end students) |
| Promise | Multiply team output under brand control |
| Dogfood | **Lumo Learn** as first workspace |

---

## 2. Roles (unchanged model)

| Role | Notes |
|------|--------|
| `owner` | Full control: connectors, modes, caps, invites, plan settings |
| `editor` | Run agents, create drafts |
| `viewer` | Read-only |
| **Approver** | **Not a fourth role** — `can_approve` flag on membership |
| **Agency** | **Usage pattern** — many workspaces via switcher; no cross-workspace aggregate reads |

---

## 3. FR-Q-101 — Launch connectors

| Decision | Detail |
|----------|--------|
| Publish order | **1) LinkedIn** → **2) Meta (Facebook Page + Instagram)** |
| Media drafts | All platforms (IG, FB, LinkedIn, TikTok, X, YouTube) from the start |
| Publish at launch | Only networks with a live OAuth connector |
| Start in parallel | Meta **app review / business verification** (lead time) |
| Later | YouTube, X, TikTok publish when APIs/access allow; drafts until then |

---

## 4. FR-Q-102 — `auto_within_rules` shape

Auto-publish is **not** "post anything." Defaults:

| Dimension | Rule |
|-----------|------|
| Networks | Only accounts explicitly enabled for auto |
| Content types | `content_draft` by default |
| Time window | **09:00–20:00** workspace timezone, **Mon–Sat** (owner-editable) |
| Strategy score | Optional; default **off** (or min confidence ≥ 60 if enabled) |
| Claims | **Always** checked on **final body after edits** |
| Caps | Must pass AI run + publish caps |
| Blocked when | Empty approved claims, revoked token, cap reached |
| Audit | Every auto publish writes an **approval row** attributed to `rule:<id>` / system |

**Owner controls (MVP):** per-network auto on/off · timezone · daily publish cap · master auto on/off.

**Not in v2:** complex multi-condition rule graphs.

**Default mode for new workspaces:** `approve_then_publish` (safer).
**Auto mode:** allowed on **team** / **business** plans only (see plans).

---

## 5. FR-Q-103 — Publish caps

| Decision | Detail |
|----------|--------|
| Default | **5 publishes / workspace / day** |
| Scope | **Aggregate** across all platforms |
| Reset | **Midnight UTC** |
| Owner edit | Yes, clamp **1–30** / day |
| Counting | On **job execution** day (not merely on approve) |
| Retries | Same `publish_job` id does **not** double-count |

Per-platform sub-caps = later (not MUST SHIP).

---

## 6. FR-Q-104 — Plans before billing

Entitlements are **config**, not payment, until billing exists.

| Plan | Workspaces | Seats | AI runs/day | Publishes/day | Auto mode |
|------|------------|-------|-------------|---------------|-----------|
| **solo** (default) | 1 | 3 | 50 | 5 | Approve-then-publish only |
| **team** | 5 | 15 | 150 | 15 | Auto-within-rules allowed |
| **business** | 20 | 50 | 500 | 50 | Auto + higher caps |

| Decision | Detail |
|----------|--------|
| Assignment | Seed / admin script / `DEFAULT_PLAN` env |
| Billing | **Not required** for v2 launch |
| Lumo dogfood | Seed as **team** so auto can be tested |

---

## 7. Scoring & claims (assumptions locked)

| Item | Decision |
|------|----------|
| Score scale | **0–100** (ideas and leads share one numeric vocabulary) |
| High-intent lead | **≥ 70** → email team notification address |
| Claim check timing | On **final body after edits**, before publish enqueue |
| Forbidden vs approved | **Forbidden wins** |
| Empty approved claims | **Generation and publish refuse** |

---

## 8. Publish edge cases (required)

| Case | Behavior |
|------|----------|
| Lost platform response | Receipt / external id is **idempotency** anchor |
| Token revoked before schedule | Job → `failed`; notify team; no silent success |
| Multi-platform post | **Per-platform** status |
| Forbidden claim added after a post shipped | Audit flag; do not silently rewrite live posts |
| Guardrail script | Rewrite `check-no-publish` **with** first connector (allowlist publish path); do **not** delete the guard before publish exists |

---

## 9. Phase ordering

| Order | Focus |
|-------|--------|
| **0** | Core: auth, workspaces, RLS, knowledge, claims, caps, audit — **integration tests green on real DB** |
| **1** | Brain: analyze, research, strategy scores, media drafts, approvals |
| **2** | Publish vertical: **LinkedIn** first |
| **3** | Modes + team controls (`auto_within_rules`) |
| **4** | Leads + learn/metrics |
| **5** | Meta connector + expand |

**Rule:** Do **not** ship publish on unproven RLS/caps/audit. Un-skip and pass integration tests against a real database as **Phase 0 exit gate**.

**Rule:** Ship **approve-then-publish** before **auto-within-rules** (P2). Auto reuses the same enforcement plus the rule engine.

---

## 10. Non-goals for v2 launch

- Cold scrape / mass unsolicited DM or email sequences
- Posting to accounts the workspace does not own
- Guaranteed rank, revenue, or exam outcomes in copy
- Building all six network publish APIs before the first real publish
- Full ad-bid management

---

## 11. Success checks (MVP)

- [ ] Second user joins via invite and works in-workspace
- [ ] AI blocked without approved claims
- [ ] Loop: idea → draft → approve → **publish on ≥1 network**
- [ ] Publish receipt/status visible in UI
- [ ] Second workspace isolated (RLS)
- [ ] Auto (when enabled) respects caps + claims + audit row
- [ ] Team can complete first publish in under ~30 minutes after connecting one channel

---

## 12. One-sentence summary for the team

**We build a growth platform that drafts from product truth, publishes only to connected accounts under clear modes and caps, and multiplies team output—LinkedIn first, Meta second, auto-publish only with strict rules, and no spam.**

---

*Share this doc as the decision record. Spec/plan updates should match this file; conflicts → this file wins until a new dated revision.*

## Response snapshot

Stored the record verbatim at `specs/002-growth-platform-core/decisions-2026-09-15.md` with
its authority clause intact, then propagated it into `spec.md` — 15 anchored edits, each
asserted to match exactly once so nothing was silently missed.

**Closed five open questions**: FR-Q-101 (LinkedIn → Meta, drafts for all six), FR-Q-102
(fixed rule set: auto-enabled accounts, `content_draft`, 09:00–20:00 Mon–Sat workspace time,
optional confidence ≥ 60 off by default), FR-Q-103 (5/day aggregate, midnight UTC, counted on
execution, retries never double-count), FR-Q-104 (solo/team/business as config), FR-Q-108
(switcher only). The three items previously recorded as *assumptions* were ratified unchanged
and moved to a "Resolved Decisions" section.

**Two internal contradictions in the record, flagged not resolved** — recorded in the
decision file's own new §13 "Flagged on intake" so the authoritative document carries them:

1. **Cap clamp vs business plan.** §5 clamps owner edits to **1–30/day**; §6 grants business
   **50/day**. A business owner cannot reach their own entitlement. The spec states the clamp
   as `1 … min(30, plan publish limit)` and raises **FR-Q-109**.
2. **Solo plan cannot satisfy SC-005.** Solo is `DEFAULT_PLAN` with a 1-workspace limit, so
   the second-workspace isolation check is unreachable from a default account. Not a blocker
   (dogfood seeds as team; RLS tests seed their own tenants) but SC-005 now names the plan it
   runs under instead of reading as impossible.

**One question narrowed rather than closed**: FR-Q-107. §5 and §8 settle publish
*idempotency* — receipt as anchor, no double-count — but not whether a failed job retries
automatically with backoff or only by human action. Still blocking the Phase 2 publish worker.
FR-Q-105 (metrics scope/cadence) and FR-Q-106 (weekly trigger) remain open, both Phase 4.

Other structural changes to `spec.md`: US2 gained the default-mode and plan-gate scenarios;
US5 went from four generic auto scenarios to twelve concrete ones matching the locked rule
dimensions; FR-P-004 split into 004/004a/004b for cap value, execution-day counting, and
retry non-counting; FR-P-010 split into 010/010a/010b for idempotency, revoked-token failure,
and the post-hoc forbidden-claim audit flag; `PublishAttempt` renamed **PublishJob** to match
the record's `publish_job` vocabulary and defined as one draft × one connected account, which
is what makes per-platform status and cap counting fall out naturally; Scope Ladder replaced
by the locked Phase Ordering 0–5 with the Phase 0 exit gate and Meta lead-time note stated as
hard rules; SC-009 added for publish receipt visibility in the UI.

## Outcome

- ✅ Impact: Every MUST SHIP blocker is now answered. `spec.md` and the decision record agree,
  with the record holding authority and carrying its own flagged inconsistencies. Remaining
  open questions are all Phase 2+ or Phase 4, so Phase 0 can start immediately.
- 🧪 Tests: none — specification documents only.
- 📁 Files: 1 new authoritative decision record, `spec.md` updated in 15 anchored edits.
- 🔁 Next prompts: `/sp.plan` for `002-growth-platform-core`; decide FR-Q-109 (clamp ceiling)
  and FR-Q-107 (retry policy) before Phase 2; the publish-mode + connector-token ADR; start
  local Supabase and clear the 53 skipped integration tests — that is now a hard Phase 0 exit
  gate, not a nice-to-have. `spec.md` is 665 lines, over this project's 500-line guideline —
  say if you want the edge cases and entity list split into `data-model.md`.
- 🧠 Reflection: propagating a document that declares itself authoritative is the moment to
  read it adversarially, not obediently. Both contradictions were invisible section-by-section
  and only appeared when §5 and §6 were applied to the same field.

## Evaluation notes (flywheel)

- Failure modes observed: the easy failure was transcribing the plan table and the cap clamp
  into `spec.md` as separate facts without ever evaluating them together — which is exactly
  how a business-tier customer would have hit an unreachable entitlement in production.
- Graders run and results (PASS/FAIL): every edit anchored with an assert-count-of-one, all 15
  PASS; no stale FR-Q-101/102/103/104/108 references remain except the deliberate "closes"
  citations.
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): before `/sp.plan`, run `npm run check` once to
  confirm the v1 guard still passes — the window in which it can be replaced cleanly is
  exactly while no publishing SDK is present.
