# Feature Specification: Growth Instant

**Feature Branch**: `003-growth-instant`
**Created**: 2026-09-16
**Status**: Draft
**Input**: Growth Instant — Specify v3.0 (user-authored, pasted verbatim into session)

> Governed by `.specify/memory/constitution.md` (Lumo Grow Constitution **v3.1.0**).
> WHAT we build. HOW goes in `plan.md`. Tickets in `tasks.md`.
> **Requirement IDs are namespaced `FR-GI-*`** to avoid collision with
> `specs/002-growth-platform-core/`, where `FR-S-*` means Scoring and `FR-P-*` means
> Publish guardrails. The section letters below match the v3.0 source document.

## Relationship to 002-growth-platform-core

Growth Instant is the **MVP first-run path**. It does not replace 002; it takes priority
over 002 wherever the first run is concerned, and inherits the rest unchanged.

| 002 requirement | Status under v3.0 | Why |
|---|---|---|
| **FR-K-004** — refuse generation *and publish* when no claim set exists | **SUPERSEDED for first run** | Constitution v3.0.0 Principle I carve-out + SC-02. Generation proceeds on auto-extracted facts plus the global forbidden list. The claim wall must not gate a first result. |
| FR-K-001/002/003/005 — claim storage, prompt injection, forbidden-overrides-approved | **Inherited, unchanged** | Claims still bind generation; only the *empty-set gate* is lifted. |
| FR-M-001 — draft for six networks | **Deferred, not repealed** | MVP pack covers LinkedIn + Instagram (FR-GI-P-002). Remaining networks return post-MVP. |
| FR-P-001..011 — connector ownership, publish modes, caps, claim check before send, state machine, receipts | **Inherited, unchanged** | Constitution Principles III–V. MVP narrows the *surface* to LinkedIn, not the guardrails. |
| FR-O-003/005 — robots.txt-honouring fetch, unknowns stated as unknown | **Inherited, unchanged** | Directly reused by FR-GI-X. |
| FR-SYS-* — workspace isolation, RLS, audit log | **Inherited, unchanged** | Constitution VII–VIII. Silent workspace creation (FR-GI-S-003) does not weaken isolation. |
| FR-L-* (leads), FR-LRN-* (learn) | **Out of MVP path** | Not reachable from the five main screens; unchanged where already built. |

## Problem

Founders need faster market presence but will not complete heavy setup. Tools that demand
manuals lose to tools that show hurdles and content immediately from a product link.

## Users

| Segment | Priority | Notes |
|---|---|---|
| Solo founder / 2–5 person marketing team | **Primary** | The first-run target. |
| Agency running multiple product URLs | Secondary | Multi-workspace switching arrives later. |
| Enterprise workflow designers | **Not primary** | Served by Advanced only; must not shape the main path. |

## Core Loop (required)

Locked 2026-09-16 (see Decisions).

```
Auth (sign in)
  → Start: URL + goal
  → Auto workspace create/select + analyze
  → Hurdles (<2 min job-ready target)
  → Generate pack
  → Pack (edit/select)
  → Publish (LinkedIn; IG draft-only until Meta)
  → Next
```

**Navigation contract (locked 2026-09-16).** Binding for SC-06.

| Element | Status |
|---|---|
| Auth (sign in) | **Pre-app gate** — not a nav destination |
| Start · Hurdles · Pack · Publish · Next | **The five primary destinations** |
| Generate pack | **Action on Hurdles** — not a sixth screen |
| Settings / Advanced | **Not main nav** |

The main path is exactly at the cap, with no room for a sixth destination. Any new main-nav
entry must displace one of the five or live in Advanced.

## Decisions (2026-09-16)

Author-locked answers to open questions raised during transcription. These win over any
looser reading of §3–4 above.

1. **Sign-in precedes Start.** A user authenticates before submitting a URL. SC-01's "only
   a URL" governs what the *Start step* asks for, not whether an account exists.
2. **Instagram is draft-only until Meta publishing ships.** IG variants are generated and
   editable but never reach a publishable state in MVP.
3. **The <2 min hurdles target is measured to analysis job ready**, server-side — not to
   first paint of the rendered list.
4. **The navigation contract above is locked**: Auth is a pre-app gate, the five
   destinations are Start · Hurdles · Pack · Publish · Next, *Generate pack* is an action on
   Hurdles rather than a screen, and Settings / Advanced stay out of main nav.

## User Scenarios & Testing *(mandatory)*

Derived from the core loop above; no scope beyond §3–4 of the source document.

### US1 — First result from a link alone (P1)
A founder signs in, pastes an https URL, optionally picks a goal, and reaches a ranked
hurdle list without creating claims, filling a knowledge form, or reading documentation.
**Acceptance**: after sign-in, hurdles render from URL + optional goal only; no workspace
setup step and no blocking claim form appears between Start and Hurdles.

### US2 — One-click pack (P1)
From the hurdle list, the founder presses one CTA and receives campaign angles, posts, and
a light 7-day plan.
**Acceptance**: a single action moves hurdles → pack; Knowledge is never a prerequisite.

### US3 — Approve and publish (P1)
The founder connects LinkedIn via OAuth, selects posts, approves, and publishes.
**Acceptance**: a real post reaches the connected account; per-post status and the platform
receipt are recorded.

### US4 — Know what happened next (P2)
After publishing, the founder sees what shipped and three concrete next actions.
**Acceptance**: publish outcome plus exactly three next actions; re-analyze / new pack
available.

### US5 — Adjust without being forced to (P3)
The founder edits auto-extracted product facts, reviews forbidden-claim defaults, invites a
teammate, or reads the audit log — all from Advanced, never on the first run.
**Acceptance**: none of these appear in the five main destinations.

### Edge Cases
- Invalid or non-https URL; unreachable host; `robots.txt` disallows fetch.
- Site with too little public content to yield 3 hurdles.
- Provider timeout mid-analysis or mid-generation; retry path from a failed state.
- Publish token revoked between approval and send.
- Generated copy trips a forbidden pattern after an inline edit.

## Requirements *(mandatory)*

**FR-GI-S — Start**

- **FR-GI-S-001**: System MUST require an authenticated session before the Start step.
  Sign-in is the entry gate; it is not a nav destination and does not count against SC-06.
- **FR-GI-S-002**: System MUST accept an https URL as the only required input at Start, and
  a goal enum (`signups` | `awareness` | `waitlist` | `other`) as optional.
- **FR-GI-S-003**: System MUST create or select a workspace silently, without presenting a
  workspace setup step on the first run.
- **FR-GI-S-004**: System MUST start an analysis job on submit.

**FR-GI-H — Hurdles**

- **FR-GI-H-001**: System MUST output a list of 3–7 hurdles within the target latency
  (see Non-Functional).
- **FR-GI-H-002**: Each hurdle MUST carry a title, a plain-language explanation, why it
  hurts growth, a suggested fix, and linked content actions.
- **FR-GI-H-003**: The view MUST present a single primary CTA: *Generate growth pack*.
- **FR-GI-H-004**: System MUST show analysis status as running, ready, or failed, and MUST
  offer retry from failed.

**FR-GI-P — Pack**

- **FR-GI-P-001**: On generate, System MUST produce at least 3 campaign angles, each with a
  simple score of 0–100.
- **FR-GI-P-002**: System MUST produce at least 5 social posts with platform variants,
  covering LinkedIn and Instagram at minimum.
- **FR-GI-P-003**: System MUST produce a light 7-day suggestion plan.
- **FR-GI-P-004**: System MUST allow inline editing of generated fields.
- **FR-GI-P-005**: System MUST allow selecting posts for publish.
- **FR-GI-P-006**: System MUST NOT require a visit to Knowledge before generating.

**FR-GI-U — Publish**

- **FR-GI-U-001**: System MUST support OAuth connection to LinkedIn for the MVP.
- **FR-GI-U-002**: System MUST support approve-and-publish, and scheduling, for selected
  posts.
- **FR-GI-U-003**: Each post MUST carry a status of `draft` | `approved` | `scheduled` |
  `published` | `failed`.
- **FR-GI-U-004**: System MUST store the external receipt or platform id when one is
  returned.
- **FR-GI-U-005**: Meta publishing is post-MVP unless already available.
- **FR-GI-U-006**: Instagram variants MUST remain draft-only until Meta publishing ships.
  They are generated and editable, MUST NOT be approvable, schedulable, or publishable, and
  MUST NOT count toward the daily publish cap.
- **FR-GI-U-007** *(inherited, restated for the MVP surface)*: Publishing MUST run the claim
  check on the final edited body before send, MUST respect the workspace publish mode and
  daily cap, and MUST target only a connected account of that workspace
  (002 FR-P-004/006/007; Constitution IV–V).

**FR-GI-N — Next**

- **FR-GI-N-001**: System MUST list what published.
- **FR-GI-N-002**: System MUST present 3 next actions (e.g. fix CTA on site, post #2
  tomorrow, add proof section).
- **FR-GI-N-003**: System MUST offer *Run new pack* and *Re-analyze*.

**FR-GI-A — Advanced** *(hidden from first run)*

- **FR-GI-A-001**: System MUST allow editing auto-extracted product facts.
- **FR-GI-A-002**: System MUST provide a forbidden-claim defaults view.
- **FR-GI-A-003**: System MUST provide team invite.
- **FR-GI-A-004**: System MUST provide the audit log.
- **FR-GI-A-005**: System MUST display caps.
- **FR-GI-A-006**: None of FR-GI-A-001..005 may appear in the first-run path or consume one
  of the five primary destinations. **Settings and Advanced are not main nav** — they are
  reached from within a screen, not from the primary navigation. Adding either to main nav
  is a violation of SC-06, not a layout preference.

**FR-GI-X — Extraction & safety**

- **FR-GI-X-001**: System MUST extract from public HTML: name, tagline, features, CTA, and
  pricing signals where present.
- **FR-GI-X-002**: System MUST seed internal `product_facts` from the extraction for use in
  prompts.
- **FR-GI-X-003**: System MUST apply global forbidden patterns (guaranteed results, fake
  "#1", false certification) automatically during generation.
- **FR-GI-X-004**: Generation MUST use extracted facts plus the forbidden list **without
  blocking on an empty manual approved-claims list**. This supersedes 002 FR-K-004 for the
  first run.
- **FR-GI-X-005** *(inherited)*: Extraction MUST honour `robots.txt` and MUST state unknown
  facts as unknown rather than inventing them (002 FR-O-003/005; Constitution II).

## Key Entities

- **workspace**, **user membership** — existing; isolation by `workspace_id` unchanged.
- **analyze_run** — `url`, `status`, `hurdles_json`, `raw_summary`.
- **product_facts** — auto-extracted plus user edits.
- **growth_pack**, **pack_posts**, **campaign_angles**.
- **connected_account**, **publish_job** — existing publish path.
- **event_log** — analysis, generate, publish.

## Non-Functional Requirements

- **NFR-GI-001**: Hurdles target **< 120s p95 to analysis job ready**, measured server-side
  when the provider is healthy. Render time after job-ready is not counted here.
- **NFR-GI-002**: Pack generation target **< 180s p95**.
- **NFR-GI-003**: The main path MUST be usable on mobile.
- **NFR-GI-004**: Errors MUST be stated clearly and distinctly for: invalid URL, fetch
  failed, provider timeout, and publish token revoked.

## Success Criteria *(mandatory)*

- **SC-01**: A new user reaches hurdles with only a URL (plus optional goal).
- **SC-02**: No blocking "add approved claims" step on first generate.
- **SC-03**: A growth pack is produced in one click from hurdles.
- **SC-04**: At least one real LinkedIn publish from an approved post.
- **SC-05**: The Next screen shows publish outcome plus next actions.
- **SC-06**: Main navigation is ≤ 5 primary destinations for new users.

## Out of Scope (MVP)

- Mandatory claim form gate
- Cold outbound lead engine
- Full multi-network auto-poster
- Deep private-app login scraping

Deferred, not repealed: multi-network drafting, `auto-within-rules` as a primary path, and
the full knowledge wiki remain constitutional (Principles III–V) and return after MVP.

## Open Questions

Four remain. None block drafting `plan.md`, but each changes behaviour. Three others were
resolved on 2026-09-16 — see Decisions above.

1. **[NEEDS CLARIFICATION]** FR-GI-S-003 "creates or selects" — what rule selects an existing
   workspace instead of creating one? Same URL, same owner, most recent? A returning founder
   who pastes a second URL either lands in their existing workspace or silently accumulates
   workspaces; both are defensible and they behave very differently at the Advanced screens.
2. **[NEEDS CLARIFICATION]** Goal `other` — free text fed to the prompt, or a label with no
   generation effect?
3. **[NEEDS CLARIFICATION]** FR-GI-U-005 "unless already available" — what makes Meta
   publishing count as available: a merged connector, a live token, or a passing end-to-end
   test? FR-GI-U-006 keys IG draft-only off this condition, so it needs a definite trigger.
4. **[NEEDS CLARIFICATION]** Which daily cap value applies to a silently-created workspace?
   002 FR-P-004 requires a cap on every mode; v3.0 does not name a default.

**Resolved 2026-09-16:** sign-in precedes Start (Decision 1); Instagram draft-only until
Meta (Decision 2); the <2 min target is measured to analysis job ready, server-side
(Decision 3).
