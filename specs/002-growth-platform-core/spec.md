# Feature Specification: Growth Platform Core

**Feature Branch**: `002-growth-platform-core`
**Created**: 2026-09-15
**Status**: Draft
**Input**: Growth Platform — Specify v2.0 (user-authored, pasted verbatim into session)

> Governed by `.specify/memory/constitution.md` (Lumo-Ops Constitution **v2.0.0**).
> Decisions locked by [decisions-2026-09-15.md](./decisions-2026-09-15.md) — **that file
> wins on conflict** with anything here, until a newer dated revision.
> WHAT we build. HOW goes in `plan.md`. Tickets in `tasks.md`.
> Supersedes `specs/001-lumo-ops-core/` — see
> [its conformance audit](../001-lumo-ops-core/v2-conformance-audit.md) for what this
> feature **inherits** from the v1 core rather than rebuilding.

## Problem

Small and mid teams cannot produce consistent multi-channel growth work without either
burning founder time or hiring faster than revenue. Large teams struggle with brand
consistency, approvals, and audit. Tools that only draft fail adoption; tools that spam
fail trust and platform policy.

## Users

| Role | Capability |
|---|---|
| Owner / admin | Billing, connectors, publish modes, caps, roles |
| Editor | Run agents, create drafts |
| Viewer | Read-only |

**Approver is not a fourth role.** It is an explicit per-membership grant on top of
editor (`can_approve`, inherited from v1). Owners always approve; viewers never.

**Agency operator** is an owner or editor holding memberships in many workspaces. It is a
usage pattern, not a role: many workspaces reached through a **switcher**, with **no
cross-workspace aggregate reads** (decisions §2, Constitution VII).

**Buyer**: founder, marketing lead, agency.

**Not users**: the end customers of the *marketed* product. They are the audience content
is *about*, never accounts on this platform. (Corrects the v1 spec's "team-only" framing,
which v1.1.0 already superseded with open sign-up.)

## Core Loop (required)

```text
Product/niche + knowledge
  → Analyze & R&D
  → Scored campaign ideas
  → Multi-platform assets
  → Approve or auto-rules
  → Publish/schedule
  → Measure
  → Recommend + update knowledge (human confirm for claim changes)
```

Every user story below is a segment of this loop. A story that produces output the next
segment cannot consume is a failed story — Constitution self-audit question 1 ("does this
multiply team output, or only create orphan drafts?").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Workspace onboarding and product analysis (Priority: P1)

An authenticated user creates a workspace for one product or brand, supplying name, slug,
niche, primary URL, goals, and tone. The system fetches and summarizes that public URL and
returns a product summary, content themes, content gaps, and risks stated against the
claim set. The user turns that into knowledge docs and an approved/forbidden claim set.

**Why this priority**: Constitution I and II — nothing may generate until product truth
exists. This is also the only path by which a new workspace gets useful, so it gates
adoption as well as safety.

**Independent Test**: Create a workspace from a URL, confirm an analysis report is stored
with all four output sections, and confirm a non-member reads zero rows of it.

**Acceptance Scenarios**:

1. **Given** an authenticated user under their plan's workspace limit, **When** they
   complete onboarding, **Then** the workspace exists with niche, primary URL, goals, and
   tone recorded, and they hold an `owner` membership.
2. **Given** a user at their plan's workspace limit, **When** they attempt to create
   another, **Then** creation is refused with the limit named.
3. **Given** a primary URL, **When** analysis runs, **Then** a stored report contains a
   product summary, themes, content gaps, and risks-vs-claims.
4. **Given** a target URL whose `robots.txt` disallows fetching, **When** analysis runs,
   **Then** no fetch occurs and the user is told why.
5. **Given** an analysis report, **When** it asserts anything about the product, **Then**
   each statement is labelled Fact | Inference | Hypothesis and unknowns are stated as
   unknown rather than filled in (Constitution II).
6. **Given** a workspace with no claim set, **When** any generation or publish is
   attempted, **Then** it is refused.

---

### User Story 2 - Connect a channel and choose the publish mode (Priority: P1)

An owner connects a social account via that platform's official OAuth flow and sets the
workspace publish mode to `draft_only`, `approve_then_publish`, or `auto_within_rules`.
Mode and caps are visible wherever publishing can happen.

**Why this priority**: Constitution III and IV. Without a connected account and a declared
mode, there is no publish path at all — and an undeclared mode is a defect, not a default.

**Independent Test**: Connect one account, set each of the three modes in turn, and confirm
the publish surface reflects the current mode and refuses a target that is not connected.

**Acceptance Scenarios**:

1. **Given** an owner, **When** they complete a channel's OAuth flow, **Then** a connected
   account is stored for that workspace with its platform, account identity, granted
   scopes, and token material held server-side only.
2. **Given** a non-owner (editor or viewer), **When** they attempt to connect, disconnect,
   change the mode, change caps, or change roles, **Then** it is refused (Constitution
   Safety level: High → owner only).
3. **Given** any publish attempt, **When** its target account is not a connected account of
   that workspace, **Then** it is refused (Constitution III — never to non-owned accounts).
4. **Given** a connected account whose token is expired or revoked at the platform,
   **When** a publish runs, **Then** it fails with a reconnect prompt and no partial post.
5. **Given** an owner disconnects an account, **When** scheduled items target it, **Then**
   those items do not publish and are surfaced as blocked.
6. **Given** any workspace, **When** it is read, **Then** exactly one publish mode is set —
   there is no null or implicit mode.
7. **Given** a newly created workspace, **When** it is first read, **Then** its mode is
   `approve_then_publish` (decisions §4 — the safer default, not `draft_only`).
8. **Given** a workspace on the **solo** plan, **When** an owner attempts to select
   `auto_within_rules`, **Then** it is refused — auto requires **team** or **business**
   (decisions §4, §6).

---

### User Story 3 - Multi-platform assets from the claim set (Priority: P1)

An editor picks a topic (or an approved campaign idea) and generates a per-platform asset
package — hook, script/body, captions, titles, hashtags, CTA, visual plan — with
platform-native length and tone variants for Instagram, Facebook, LinkedIn, TikTok, X, and
YouTube. Everything is built from the workspace's claim set and brand voice.

**Why this priority**: This is the output the product exists to multiply, and the place
Constitution II is most load-bearing.

**Independent Test**: Generate a package for two platforms from one topic, confirm all
payload fields populate per platform and no forbidden claim survives to a saved draft.

**Acceptance Scenarios**:

1. **Given** a topic and target platforms, **When** generation runs, **Then** a draft is
   saved per platform with hook, script/body, captions, titles, hashtags, CTA, and visual
   plan.
2. **Given** two target platforms with different norms, **When** generation runs, **Then**
   each draft's length and tone are native to its platform rather than one text copied.
3. **Given** a workspace whose forbidden claims include phrase P, **When** any draft is
   generated, **Then** the prompt carried the forbidden list and no saved draft contains P.
4. **Given** a generated body containing a forbidden claim, **When** it is checked before
   save, **Then** the draft is not saved as publishable and the violation is audited.
5. **Given** drafting for a platform with no publish connector available, **When**
   generation runs, **Then** the draft is still produced and marked draft-only for that
   platform (§8 out-of-scope).

---

### User Story 4 - Approve, then publish or schedule (Priority: P1)

In `approve_then_publish` mode, a reviewer opens the queue, approves a draft, and publishes
it now or schedules it for later to a connected account. The publish either succeeds with a
receipt or fails visibly.

**Why this priority**: Closes the loop end to end for the first time (SC-003) and is the
mode most customers will run.

**Independent Test**: Approve one draft, publish it to one connected network, and confirm a
publish record with a platform receipt plus an audit row; schedule a second and confirm it
publishes at its time and not before.

**Acceptance Scenarios**:

1. **Given** drafts awaiting approval, **When** a reviewer opens the queue, **Then** they
   see only their workspace's pending items.
2. **Given** a pending draft and a reviewer holding approval rights, **When** they approve,
   edit-and-approve, or reject with notes, **Then** the status moves accordingly and an
   approval row records target, reviewer, decision, and notes.
3. **Given** an approved draft in `approve_then_publish` mode, **When** the reviewer
   publishes now, **Then** the claim check and the publish cap are evaluated *before* the
   platform call, and on success a publish record stores the platform receipt/permalink.
4. **Given** an approved draft, **When** the reviewer schedules it for a future time,
   **Then** its status is `scheduled` and no platform call happens until that time.
5. **Given** a platform call that errors or times out, **When** it fails, **Then** status is
   `failed` with the platform error retained, and no duplicate post is created by a retry.
6. **Given** a viewer or an editor without the grant, **When** they attempt an approval or a
   publish, **Then** it is refused.
7. **Given** any publish attempt in any mode, **When** it completes or fails, **Then** an
   audit row records actor, mode, target account, claim-check result, and outcome
   (Constitution VIII).

---

### User Story 5 - Auto-within-rules publishing (Priority: P2)

An owner on a **team** or **business** plan enables `auto_within_rules`. Auto publishing is
constrained by a fixed, small rule set (decisions §4), not an arbitrary rule graph: only
accounts explicitly enabled for auto, only `content_draft` items, only inside the workspace
time window, and optionally only above a minimum confidence. Auto-published items still pass
the claim check and still consume the daily publish cap.

**Why this priority**: The differentiator against draft-only tools, and the highest-risk
surface in the product — so it ships after the approval path is proven, not beside it.

**Independent Test**: Enable auto mode with a cap of N, submit more than N qualifying
drafts, and confirm exactly N publish and the rest hold; submit one containing a forbidden
claim and confirm it never publishes.

**Acceptance Scenarios**:

1. **Given** auto mode and a draft that satisfies the rules, **When** the rules evaluate,
   **Then** it publishes without human action, and an approval row is recorded attributed to
   `rule:<id>` — an auto-publish is never unattributed (decisions §4, Constitution VIII).
2. **Given** auto mode and a draft containing a forbidden claim, **When** evaluation runs,
   **Then** it is not published, and it is routed to human review with the violation named
   (Constitution V — auto never bypasses claim checks).
3. **Given** a workspace at its daily publish cap, **When** auto mode evaluates further
   drafts, **Then** none publish and the refusals are recorded (Constitution V).
4. **Given** the cap is reached by two concurrent auto publishes at the boundary, **When**
   both evaluate, **Then** the cap holds — enforcement is a reservation, not a pre-check.
5. **Given** auto mode, **When** the target account is not connected or its token is
   invalid, **Then** nothing publishes.
6. **Given** a non-owner, **When** they attempt to change auto rules, **Then** it is refused.
7. **Given** the master auto toggle is off, **When** rules would otherwise have fired,
   **Then** nothing publishes.
8. **Given** a connected account **not** enabled for auto, **When** auto evaluates a draft
   targeting it, **Then** nothing publishes to that account.
9. **Given** the current time is outside the workspace window (default **09:00–20:00**
   workspace timezone, **Mon–Sat**), **When** auto evaluates, **Then** nothing publishes
   until the window reopens.
10. **Given** an item that is not a `content_draft`, **When** auto evaluates, **Then** it is
    not auto-published (default content type; decisions §4).
11. **Given** the optional minimum-confidence gate is enabled, **When** a draft's linked idea
    scores below **60** confidence, **Then** it is not auto-published. The gate is **off by
    default**.
12. **Given** a workspace with an empty approved-claims list, **When** auto evaluates,
    **Then** nothing publishes (decisions §4, §7).

---

### User Story 6 - Measure, then learn and propose knowledge edits (Priority: P2)

The system ingests publish receipts and whatever metrics the connectors expose, produces a
"what worked" summary weekly or on demand, suggests next topics, and proposes edits to the
workspace knowledge. Claim changes require a human to accept.

**Why this priority**: It is what turns the product from a generator into a loop — and
Constitution self-audit question 5 requires a measurable outcome. It depends on publishing
existing first.

**Independent Test**: Publish one item, confirm a receipt or metric appears against it,
request a summary, and confirm a proposed knowledge edit sits pending until accepted.

**Acceptance Scenarios**:

1. **Given** a published item, **When** metrics are pulled, **Then** a metric snapshot is
   stored against that publish record with its retrieval time.
2. **Given** a connector that exposes no metrics, **When** a pull runs, **Then** the publish
   receipt alone is shown and the absence is stated rather than estimated (SC-004).
3. **Given** published history, **When** a summary is requested or the weekly run fires,
   **Then** a stored summary reports what worked and suggests next topics, each tied to the
   evidence it rests on.
4. **Given** a proposed knowledge or claim edit, **When** it is generated, **Then** it is
   stored as a pending proposal and changes nothing until a human accepts it.
5. **Given** a pending proposal, **When** a human accepts or rejects it, **Then** the
   knowledge base changes only on accept, and either decision is audited.

---

### User Story 7 - Team: invite a second person and grant approval (Priority: P1)

An owner invites a colleague by email during their first session. The colleague joins the
same workspace, and the owner grants them approval rights.

**Why this priority**: SC-001, and Constitution IX — one platform for 1→N teams. The v1
invitation path already exists; this story proves it against the v2 role surface.

**Independent Test**: Invite a second address, redeem it from that account, and confirm
shared workspace access and a working approval grant.

**Acceptance Scenarios**:

1. **Given** an owner, **When** they invite an email with a role, **Then** an invitation is
   created that only the addressed account can redeem.
2. **Given** a redeemed invitation, **When** the invitee signs in, **Then** they see that
   workspace and only workspaces they are a member of.
3. **Given** an editor, **When** the owner grants approval rights, **Then** that editor may
   decide on approvals; when the grant is removed, they may not.
4. **Given** a member is removed, **When** they retry, **Then** their access to every row of
   that workspace ends immediately, including items they authored.

---

### User Story 8 - Scored campaign ideas from research (Priority: P2)

An editor imports or pastes customer feedback and competitor notes. The system returns
ranked opportunities with each claim-bearing statement labelled Fact | Inference |
Hypothesis, then turns them into campaign ideas scored on impact, effort, and confidence,
each linked to the evidence behind it.

**Why this priority**: It makes asset generation targeted rather than arbitrary, but assets
can be produced from a topic without it, so it follows US3.

**Independent Test**: Submit a notes blob, confirm ranked labelled opportunities, and
confirm each resulting idea carries three scores and a link to its evidence.

**Acceptance Scenarios**:

1. **Given** pasted feedback and competitor notes, **When** research runs, **Then** ranked
   opportunities are saved with every claim-bearing statement labelled.
2. **Given** saved research, **When** ideas are generated, **Then** each carries impact,
   effort, and confidence scores on the documented scale.
3. **Given** a scored idea, **When** it is read, **Then** it links to the research evidence
   it derives from, and an idea with no evidence link is not produced.
4. **Given** an idea, **When** an editor selects it, **Then** it feeds US3 asset generation
   as the topic source.

---

### User Story 9 - Inbound leads triage (Priority: P3)

Inbound leads arrive on an authenticated per-workspace webhook. The system classifies
segment and intent from that workspace's knowledge only, scores 0–100, notifies the team on
high intent, and gives the team stages and a "contact manually" task. It never contacts the
lead.

**Why this priority**: Valuable and already largely built in v1, but it is the highest
misuse surface, so it stays behind the publish work. Constitution VI is absolute regardless
of priority.

**Independent Test**: POST a lead with a valid secret and confirm a classified, staged lead
plus a team notification at score ≥ 70; POST with a bad secret and confirm nothing is stored.

**Acceptance Scenarios**:

1. **Given** a valid per-workspace secret, **When** a lead arrives, **Then** it is stored in
   that workspace with its raw payload, the workspace resolved from the verified secret and
   never from the body.
2. **Given** a wrong or missing secret, **When** the call arrives, **Then** it is rejected
   and nothing is stored.
3. **Given** a stored lead, **When** classification runs, **Then** segment and intent derive
   only from that workspace's knowledge base, with a score of 0–100 and a triage stage.
4. **Given** a lead scoring ≥ 70, **When** classification completes, **Then** the team
   notification address is emailed and a "contact manually" task is created.
5. **Given** any lead in any state, **When** the system runs, **Then** no email, DM, or
   contact of any kind is sent to the lead (Constitution VI).

---

### Edge Cases

- A workspace has no claim set when any generation or publish runs — refuse, never fall
  back to an unbound prompt.
- Approved and forbidden claims contradict each other on the same phrase — **forbidden
  wins.**
- The publish cap is reached mid-flight by concurrent publishes — the cap must hold as a
  reservation, as v1's AI-run cap already does.
- A platform accepts the post but the response is lost — the publish must not be retried
  into a duplicate; the receipt is the idempotency anchor.
- A token is revoked at the platform between approval and a scheduled publish time.
- A scheduled publish's target account is disconnected before the time arrives.
- A platform changes or rate-limits its API mid-run; partial multi-platform publishes leave
  some platforms published and others failed — per-platform status, never one aggregate.
- Mode is switched from `auto_within_rules` to `draft_only` while items are scheduled.
- A reviewer edits a draft so heavily on edit-and-approve that the published body differs
  from what the model produced — the audit must show both, and the claim check must run on
  the *edited* body.
- A forbidden claim is added to the claim set *after* something containing it was published
   — the existing publish is a recorded defect, not silently reclassified.
- An agency operator holds memberships in 30 workspaces — no view aggregates data across
  them without membership in each.
- The same lead email arrives twice from different sources.
- The last owner of a workspace is removed or demoted.
- A plan limit is lowered below a workspace's current usage.

## Requirements *(mandatory)*

### Functional Requirements

**FR-K — Knowledge & claims** *(largely inherited from v1)*
- **FR-K-001**: System MUST support CRUD of knowledge docs scoped to one workspace.
- **FR-K-002**: System MUST maintain per workspace an approved-claims list, a
  forbidden-claims list, and a brand voice.
- **FR-K-003**: System MUST inject approved claims, forbidden claims, and brand voice into
  every generation prompt for that workspace.
- **FR-K-004**: System MUST refuse generation *and publish* when no claim set exists.
- **FR-K-005**: Forbidden claims MUST override approved claims on conflict.

**FR-O — Onboarding & analyze**
- **FR-O-001**: System MUST capture name, slug, niche, primary URL, goals, and tone at
  workspace creation.
- **FR-O-002**: System MUST allow an authenticated user to create a workspace subject to
  their plan's workspace limit (solo 1 · team 5 · business 20 — decisions §6).
- **FR-O-003**: System MUST fetch and summarize public pages, honouring `robots.txt` and
  rate limits, and MUST NOT fetch what is disallowed.
- **FR-O-004**: System MUST output product summary, themes, content gaps, and risks stated
  against the claim set.
- **FR-O-005**: System MUST state unknowns as unknown rather than inventing product facts.

**FR-R — Research**
- **FR-R-001**: System MUST accept pasted or imported feedback and competitor notes.
- **FR-R-002**: System MUST output ranked opportunities with each claim-bearing statement
  labelled Fact, Inference, or Hypothesis.

**FR-S — Strategy**
- **FR-S-001**: System MUST score campaign ideas on impact, effort, and confidence.
- **FR-S-002**: Each score MUST use the documented scale (see Assumptions: 0–100 per axis).
- **FR-S-003**: Every idea MUST link to the evidence it derives from.

**FR-M — Media**
- **FR-M-001**: System MUST draft for Instagram, Facebook, LinkedIn, TikTok, X, and YouTube
  regardless of whether a publish connector exists for that platform.
- **FR-M-002**: Each asset package MUST contain hook, script/body, captions, titles,
  hashtags, CTA, and visual plan.
- **FR-M-003**: System MUST produce platform-native length and tone variants, not one body
  reused across platforms.

**FR-P — Publish**
- **FR-P-001**: System MUST connect accounts per workspace via each platform's official
  OAuth flow. Launch publish order is **LinkedIn first, then Meta (Facebook Page +
  Instagram)**; only networks with a live connector can publish (decisions §3).
- **FR-P-002**: Each workspace MUST have exactly one mode: `draft_only` |
  `approve_then_publish` | `auto_within_rules`, defaulting to **`approve_then_publish`** on
  creation. `auto_within_rules` MUST be selectable only on the **team** and **business**
  plans (decisions §4, §6).
- **FR-P-003**: Mode, cap, connector, per-network auto flag, master auto toggle, workspace
  timezone, and auto time-window changes MUST be owner-only (decisions §4, Constitution
  Safety level: High).
- **FR-P-004**: System MUST enforce a daily publish cap per workspace, **aggregate across
  all platforms**, defaulting to **5/day**, resetting at **midnight UTC**, owner-editable
  within **1 … min(30, plan publish limit)** (see FR-Q-109). Per-platform sub-caps are out of
  MUST SHIP. The daily AI run cap is also per workspace (default 50, UTC reset,
  owner-editable — inherited from v1); plan defaults are solo 50 · team 150 · business 500
  AI runs and solo 5 · team 15 · business 50 publishes (decisions §5, §6).
- **FR-P-004a**: A publish MUST count against the cap on the day its **job executes**, not
  the day it was approved or scheduled.
- **FR-P-004b**: A retry of the same `publish_job` MUST NOT consume the cap twice.
- **FR-P-005**: Caps MUST be enforced as reservations that hold under concurrency.
- **FR-P-006**: System MUST run the claim check on the **final body after edits, before the
  publish job is enqueued**, in every mode including auto (decisions §4, §7).
- **FR-P-007**: System MUST publish only to a connected account of that workspace.
- **FR-P-008**: Status MUST follow `draft → awaiting_approval → approved → scheduled →
  published | failed | rejected`, per platform target.
- **FR-P-009**: No platform SDK or call site MUST be able to post outside this state
  machine. *(This requirement replaces v1's `scripts/check-no-publish.mjs`, which currently
  fails the build on any publishing SDK — see conformance audit C1. The guard must be
  rewritten in the same slice that adds the first connector, never deleted ahead of it.)*
- **FR-P-010**: System MUST record a publish job with platform receipt or platform error for
  every attempt, using the platform receipt / external id as the **idempotency anchor**, and
  MUST NOT create a duplicate post on retry (decisions §8).
- **FR-P-010a**: When a token is revoked before a scheduled job runs, the job MUST move to
  `failed` and notify the team — never report silent success (decisions §8).
- **FR-P-010b**: When a forbidden claim is added *after* a post shipped, the system MUST
  raise an audit flag and MUST NOT silently rewrite or retract the live post (decisions §8).
- **FR-P-011**: System MUST support publishing now and scheduling for later.

**FR-L — Leads** *(largely inherited from v1)*
- **FR-L-001**: System MUST ingest leads on an authenticated per-workspace webhook,
  resolving the workspace from the verified secret.
- **FR-L-002**: System MUST classify segment (enum) and intent using only that workspace's
  knowledge base, scoring 0–100.
- **FR-L-003**: System MUST notify the team address when score ≥ 70.
- **FR-L-004**: System MUST provide triage stages and a "contact manually" task.
- **FR-L-005**: System MUST NOT send any autonomous email or DM to a lead in v2.0.

**FR-LRN — Learn**
- **FR-LRN-001**: System MUST ingest publish results and whatever metrics each connector
  exposes.
- **FR-LRN-002**: System MUST produce a "what worked" summary weekly and on demand.
- **FR-LRN-003**: System MUST suggest next topics tied to evidence.
- **FR-LRN-004**: System MUST store knowledge and claim edits as proposals that change
  nothing until a human accepts them.

**FR-A — Control plane**
- **FR-A-001**: System MUST provide an approvals queue, an audit log view, an AI run log
  view, and member management.
- **FR-A-002**: System MUST enforce plan-aware limits on workspaces, seats, AI runs, and
  publishes per the decisions §6 table, and MUST gate `auto_within_rules` to team/business —
  independent of whether billing is implemented. Plans are assigned by seed, admin script, or
  `DEFAULT_PLAN` env.
- **FR-A-003**: System MUST record approval decisions with target, reviewer, decision, and
  notes — including auto-mode decisions, attributed to the rule.

**FR-SYS — System** *(inherited from v1)*
- **FR-SYS-001**: System MUST enforce workspace isolation via row-level security.
- **FR-SYS-002**: System MUST audit every AI run, every publish action, and every approval.
- **FR-SYS-003**: System MUST require an authenticated session and workspace membership on
  every route except the lead-ingest webhook.
- **FR-SYS-004**: System MUST keep LLM keys, service-role credentials, and OAuth tokens
  server-side only.

### Resolved Decisions

*Locked by [decisions-2026-09-15.md](./decisions-2026-09-15.md). The three items previously
recorded here as assumptions were ratified unchanged.*

- **Scoring scale** — **0–100** per axis for impact, effort, and confidence. Ideas and leads
  share one numeric vocabulary. (decisions §7)
- **Auto-mode attribution** — every auto publish writes an approval row attributed to
  `rule:<id>` / system. (decisions §4)
- **Claim check timing** — on the **final body after edits**, before the publish is enqueued.
  (decisions §7)
- **Launch connectors** — LinkedIn first, then Meta (Facebook Page + Instagram). Drafts for
  all six platforms from the start; publish only where a connector is live. Meta app review
  and business verification start in parallel because they are lead time, not work.
  (decisions §3, closes FR-Q-101)
- **Auto-rule shape** — a fixed small rule set, not a rule graph: auto-enabled accounts only,
  `content_draft` only, inside the workspace time window (default 09:00–20:00, Mon–Sat),
  optional minimum confidence ≥ 60 (**off** by default). Owner controls at MVP: per-network
  auto on/off, timezone, daily publish cap, master auto on/off. (decisions §4, closes
  FR-Q-102)
- **Publish caps** — default 5/workspace/day, aggregate across platforms, midnight UTC reset,
  counted on job execution, retries never double-count. (decisions §5, closes FR-Q-103)
- **Plans before billing** — entitlements are config, not payment: solo (default) 1 workspace
  / 3 seats / 50 AI runs / 5 publishes / no auto · team 5 / 15 / 150 / 15 / auto allowed ·
  business 20 / 50 / 500 / 50 / auto allowed. Assigned by seed, admin script, or
  `DEFAULT_PLAN` env. Lumo Learn seeds as **team** so auto can be exercised.
  (decisions §6, closes FR-Q-104)
- **Agency surface** — a workspace switcher over one's own memberships. No cross-workspace
  aggregate reads. (decisions §2, closes FR-Q-108)
- **Default publish mode** — `approve_then_publish` for new workspaces. (decisions §4)

### Open Questions

Each blocks the phase named. None should be guessed.

- **FR-Q-105 — Metrics scope and refresh.** [NEEDS CLARIFICATION: which metrics per platform,
  and whether they are pulled on demand only or on a schedule that consumes API quota.]
  **Blocks**: US6, Phase 4.
- **FR-Q-106 — Weekly summary trigger.** [NEEDS CLARIFICATION: what fires the weekly run — a
  platform scheduler, or first-visit-of-the-week?] The workspace timezone introduced by the
  auto-rule decision (decisions §4) is the natural clock for it. **Blocks**: FR-LRN-002,
  Phase 4.
- **FR-Q-107 — Failed publish retry policy.** *Narrowed, not closed.* Decisions §5 and §8
  settle idempotency — the platform receipt is the anchor and a retried `publish_job` never
  double-counts the cap — but not whether a failed job retries **automatically with backoff**
  or **only on a human action**. **Blocks**: the Phase 2 publish worker.
- **FR-Q-109 — Publish-cap clamp ceiling.** *Raised while propagating the decision record.*
  Decisions §5 sets the owner-editable clamp at **1–30/day**, while §6 grants **business** a
  publish limit of **50/day** — so a business owner cannot reach their own entitlement. This
  spec states the clamp as `1 … min(30, plan publish limit)` pending a decision. [NEEDS
  CLARIFICATION: is the clamp ceiling the plan's publish limit rather than a flat 30?]
  **Blocks**: nothing in Phase 0–2; must be settled before the business plan is offered.

### Key Entities

Inherited from v1 and unchanged: **Workspace**, **Membership** (`role`, `can_approve`),
**KnowledgeDoc**, **ClaimSet**, **ResearchReport**, **ContentDraft**, **Campaign**,
**Lead**, **Approval**, **AuditLog**, **AiRunLog**, **Invitation**.

Extended:

- **Workspace** gains `niche`, `primary_url`, `goals`, `tone`, `timezone`, `publish_mode`
  (default `approve_then_publish`), `daily_publish_cap` (default 5), `auto_enabled` (master
  toggle), `auto_window_start` / `auto_window_end` / `auto_days`, `plan`.
- **ContentDraft** gains a platform target and its position in the FR-P-008 status machine.

New:

- **ConnectedAccount**: a workspace's authorization on one platform. `workspace_id`,
  `platform`, `external_account_id`, `display_name`, `scopes[]`, token material
  (server-side, encrypted), `auto_enabled` (per-network auto flag), `connected_by`,
  `expires_at`, `revoked_at`.
- **AnalysisReport**: output of FR-O. `workspace_id`, `source_url`, `product_summary`,
  `themes`, `content_gaps`, `claim_risks`.
- **CampaignIdea**: `workspace_id`, `title`, `impact`, `effort`, `confidence`,
  `evidence_refs[]`.
- **PublishJob**: one publish of one draft to one connected account — the unit the cap
  counts and the unit a retry reuses, so multi-platform posts carry per-platform status
  naturally. `workspace_id`, `draft_id`, `connected_account_id`, `mode`, `actor`
  (`user:<id>` or `rule:<id>`), `claim_check_result`, `scheduled_for`, `executed_on` (the
  cap's counting day), `status` per FR-P-008, `platform_receipt` (idempotency anchor),
  `platform_error`.
- **AutoPublishRule**: the fixed MVP rule set per workspace — auto-enabled accounts, allowed
  content types (default `content_draft`), time window and days, optional minimum confidence
  (default off). No multi-condition graphs in v2 (decisions §4).
- **MetricSnapshot**: `workspace_id`, `publish_attempt_id`, metrics payload, `retrieved_at`.
- **LearnSummary**: `workspace_id`, period, findings, suggested topics, `evidence_refs[]`.
- **KnowledgeProposal**: a pending edit. `workspace_id`, target, proposed change,
  `status` (pending | accepted | rejected), `decided_by`.
- **Plan**: `solo` | `team` | `business`, each fixing workspace, seat, AI-run, and publish
  limits and whether auto mode is permitted (decisions §6). Config, not billing.

## Non-Functional Requirements

- **NFR-001**: Zero cross-workspace reads, proven by executable RLS tests over every table.
- **NFR-002**: A claim violation in a published body is a defect.
- **NFR-003**: A publish requires a valid connector and mode permission — both checked
  server-side, never inferred from the client.
- **NFR-004**: Inviting a second user is reachable within the first-session path.
- **NFR-005**: OAuth tokens are encrypted at rest and never reach the browser.
- **NFR-006**: p95 draft generation under 60s for typical prompts, when the provider allows
  (carried from v1 NFR-002).

## Phase Ordering

Locked by decisions §9.

| Order | Focus |
|---|---|
| **0** | Core: auth, workspaces, RLS, knowledge, claims, caps, audit — **integration tests green on a real database** |
| **1** | Brain: analyze, research, strategy scores, media drafts, approvals |
| **2** | Publish vertical: **LinkedIn** first |
| **3** | Modes + team controls (`auto_within_rules`) |
| **4** | Leads + learn/metrics |
| **5** | Meta connector + expand |

**Phase 0 exit gate (hard).** Do not ship publish on unproven RLS, caps, or audit. The 53
integration tests inherited from v1 are written and skipped; they must be un-skipped and
passing against a real database before Phase 2 begins. This is the single largest piece of
carried debt in the project — see the
[v1 conformance audit §3](../001-lumo-ops-core/v2-conformance-audit.md).

**Mode ordering (hard).** `approve_then_publish` ships before `auto_within_rules`. Auto is
the same enforcement path plus a rule engine, so building it first would put the rule engine
on top of unproven enforcement.

**Meta lead time.** App review and business verification start during Phase 0–1, in parallel,
because they are waiting time rather than work. LinkedIn is first precisely so the publish
vertical is not blocked on someone else's review queue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A second user joins by invite and works in the same workspace.
- **SC-002**: Generation is blocked when no approved claims exist.
- **SC-003**: The full loop runs: idea → draft → approve → publish to at least one connected
  network.
- **SC-004**: A metric or a publish receipt is visible against the item after publish.
- **SC-005**: A second workspace is isolated, demonstrated by an executable RLS test. *Note:
  the default **solo** plan caps a user at 1 workspace, so this check runs under a seeded
  **team** account or the tests' own seeded tenants — it is not reachable from a default
  account (decisions §13.2).*
- **SC-006**: Auto mode never exceeds caps and never posts a forbidden claim, demonstrated
  at the cap boundary under concurrency and with a seeded forbidden phrase, and every auto
  publish carries its `rule:<id>` approval row.
- **SC-007**: An SMB completes a first publish in under 30 minutes after connecting one
  channel.
- **SC-008**: Every AI run, publish attempt, and approval decision has a corresponding audit
  entry — including auto-mode publishes.

- **SC-009**: A publish receipt or status is visible in the UI for every publish job
  (decisions §11).

**Verification debt carried in from v1:** no migration has ever been applied to a database
and 53 integration tests remain written-but-skipped, so v1's RLS, cap, and audit guarantees
are reviewed rather than proven. SC-005 and SC-006 rest on those mechanisms. Clearing this is
the **Phase 0 exit gate**, not a follow-up.

## Out of Scope (v2.0 launch)

- Guaranteed ranking or sales outcomes (Constitution: agent boundaries).
- TikTok, X, and YouTube *publishing* where API access is blocked — drafting still ships.
- Full ad-bid management.
- Training on private app backends without user-provided access.
- Mass unsolicited outreach, posting to non-owned accounts, and any publish without a
  declared mode and caps (Constitution: permanently out, not merely deferred).
- Autonomous email or DM to a lead, pending a separately specified compliant sequence.
- Cold scraping and mass unsolicited DM or email sequences (decisions §10).
- Building all six network publish APIs before the first real publish (decisions §10).
- Per-platform publish sub-caps and multi-condition auto-rule graphs (decisions §4, §5).
