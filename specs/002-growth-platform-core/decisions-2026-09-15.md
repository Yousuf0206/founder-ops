# Growth Platform v2 — Team decisions

**Status:** Locked for MUST SHIP
**Date:** 2026-09-15
**Product:** Multi-workspace growth platform (Path B)
**Supersedes:** Draft-only Founder Ops as the end-state product

> **Authority.** This file is the decision record. `spec.md`, `plan.md`, and `tasks.md`
> must match it; on conflict **this file wins** until a new dated revision. Two internal
> inconsistencies were found while propagating it into `spec.md` — see
> [§13 Flagged on intake](#13-flagged-on-intake). They are recorded, not silently resolved.

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

## 13. Flagged on intake

*Added 2026-09-15 while propagating this record into `spec.md`. Not resolved here — this
file wins on conflict, so these need a decision from the owner, not a default from the spec.*

1. **Cap clamp contradicts the business plan.** §5 sets the owner-editable publish cap clamp
   at **1–30/day**; §6 grants **business** a publish cap of **50/day**. A business-plan owner
   cannot reach their own entitlement. Likely intent: the clamp upper bound is the *plan's*
   publish limit rather than a flat 30. Until decided, `spec.md` states the clamp as
   `1 … min(30, plan limit)` and marks it **FR-Q-109**.
2. **Solo plan cannot satisfy SC-005.** §6 gives **solo** a limit of **1 workspace**, and
   solo is the `DEFAULT_PLAN`. The second-workspace isolation check (§11, SC-005) therefore
   cannot be performed by a default account at all. Not a blocker — the dogfood workspace
   seeds as **team**, and the RLS tests seed their own tenants — but the success check must
   name the plan it runs under or it reads as unreachable.

Also narrowed rather than closed: §5 and §8 settle publish-retry *idempotency* (same
`publish_job` never double-counts; the platform receipt is the anchor) but not whether a
failed job retries **automatically with backoff** or **only on a human action**. Tracked as
**FR-Q-107** in `spec.md`, still open, blocking the Phase 2 publish worker.

Closed by this record: **FR-Q-101** (§3), **FR-Q-102** (§4), **FR-Q-103** (§5),
**FR-Q-104** (§6), **FR-Q-108** (§2 — switcher only, no aggregate reads).
Still open and untouched: **FR-Q-105** (metrics scope and refresh cadence) and
**FR-Q-106** (weekly-summary trigger), both Phase 4.
