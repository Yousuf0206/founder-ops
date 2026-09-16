# Feature Specification: Lumo Grow Core

> **CLOSED — superseded by Constitution v2.0.0 (2026-09-15).** This document was written
> and built under v1.0.0, whose Principle I was "Draft, Never Auto-Publish". v2.0.0 makes
> publishing in scope under human-set modes, so parts of this document are now wrong by
> design. Do not implement against it. See
> [v2-conformance-audit.md](./v2-conformance-audit.md) for the conflict list, what v2
> inherits, and what is newly missing.

**Feature Branch**: `001-lumo-ops-core`
**Created**: 2026-09-11
**Status**: Closed — superseded by Constitution v2.0.0
**Input**: Lumo Grow — Specify v1.0 (user-authored, pasted verbatim into session)

> Governed by `.specify/memory/constitution.md` (Lumo-Ops Constitution v1.0.0).
> WHAT we build. HOW is in `plan.md`. Tickets in `tasks.md`.

## Problem

Small teams waste time on repetitive research, content, and lead handling, and risk
inconsistent or unsafe product claims when promoting apps like Lumo Learn.

## Users

| Role | Capability |
|---|---|
| Owner | Full control of workspace |
| Editor | Create drafts, run bots, approve if permitted |
| Viewer | Read-only |

**Not users:** end students/customers of the marketed product. (Constitution V — team-only.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Workspace with a governed knowledge base (Priority: P1)

A team member signs in, lands in a workspace they are a member of, and records the
product truth for it: knowledge docs, the approved claims list, the forbidden claims
list, and the brand voice. Nothing else in the product can generate text until this
exists, because every prompt is built from it.

**Why this priority**: It is the foundation of Constitution principles II and III — the
knowledge base is the only source of product claims, and it binds every prompt. Research
and content are unsafe without it.

**Independent Test**: Sign in as a member, create a workspace, add a knowledge doc and a
claim set, and confirm a second (non-member) account cannot read any of those rows.
Delivers value on its own as a single source of product truth the team can consult.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no workspace, **When** they create a workspace,
   **Then** they become its owner and a membership row is created linking them to it.
2. **Given** an owner in a workspace, **When** they create, edit, and delete knowledge
   docs, **Then** each doc is scoped to that `workspace_id` and records `last_verified_at`.
3. **Given** an owner in a workspace, **When** they save approved claims, forbidden
   claims, and brand voice, **Then** the claim set is stored and readable by all members
   of that workspace.
4. **Given** a user who is NOT a member of workspace W, **When** they query any row
   belonging to W by any route, **Then** they receive zero rows.
5. **Given** a viewer, **When** they attempt to edit a knowledge doc, **Then** the write
   is rejected.

---

### User Story 2 - Research report from pasted notes (Priority: P1)

An editor pastes raw customer feedback and competitor notes into the research tool. The
system produces a ranked list of opportunities where every statement is labelled Fact,
Inference, or Hypothesis, saves it as a report in the workspace, and sends nothing
anywhere.

**Why this priority**: It is the first bot that proves the knowledge-bound prompt path,
the AI run cap, and the audit log all work end to end — and it is entirely internal, so
it carries no publish risk.

**Independent Test**: Paste a notes blob, run research, and confirm a saved report exists
in the workspace with labelled findings and a matching AI run log entry. Delivers value
alone as a research summarizer.

**Acceptance Scenarios**:

1. **Given** a member with a populated knowledge base, **When** they submit pasted notes,
   **Then** a research report is saved to that workspace with ranked opportunities.
2. **Given** a generated report, **When** it is read, **Then** every claim-bearing
   statement carries a Fact | Inference | Hypothesis label.
3. **Given** a research run, **When** it completes or fails, **Then** an AI run log row
   exists with workspace, actor, action, and token/cost metadata when the provider
   reports it.
4. **Given** a workspace at its daily AI run cap, **When** a member starts a research run,
   **Then** the run is refused with a clear message and no provider call is made.
5. **Given** a completed research report, **When** the system finishes, **Then** no
   outbound message of any kind is sent.

---

### User Story 3 - Content draft into the approval queue (Priority: P1)

An editor requests content for a topic, platform, audience, length, and tone. The system
returns a structured draft — hook, script, captions, titles, hashtags, CTA, visual plan —
built from the workspace's claim set, and files it as `awaiting_approval`. It is never
published by the system.

**Why this priority**: It is the product's core output, and it is where Constitution
principle I (draft, never auto-publish) and principle III (forbidden claims bind prompts)
are most load-bearing.

**Independent Test**: Request a draft, confirm it lands in `awaiting_approval` with all
payload fields populated and no forbidden claim present.

**Acceptance Scenarios**:

1. **Given** a member supplies topic, platform, audience, length, and tone, **When** the
   content bot runs, **Then** a content draft is saved with hook, script, captions,
   titles, hashtags, CTA, and visual_plan in its payload.
2. **Given** a generated content draft, **When** it is saved, **Then** its status is
   `awaiting_approval` — never `approved` or `published`.
3. **Given** a workspace whose forbidden claims include phrase P, **When** any content is
   generated, **Then** the prompt sent to the provider contains the forbidden list and
   the resulting approved output does not contain P.
4. **Given** any content draft in any status, **When** the system runs, **Then** it makes
   no call to any social platform or external publishing surface.

---

### User Story 4 - Human approval decision (Priority: P1)

An owner (or a permitted editor) opens the pending queue, reads a draft, and approves it,
edits then approves it, or rejects it with notes. Marking something `published` records
that a human published it manually elsewhere; the system never publishes.

**Why this priority**: Without it, drafts pile up and the product delivers nothing. It is
the human gate that principle I is built around.

**Independent Test**: Generate a draft, approve one and reject another, and confirm both
decisions are recorded with reviewer and audit entries.

**Acceptance Scenarios**:

1. **Given** drafts awaiting approval, **When** a reviewer opens the queue, **Then** they
   see all pending items in their workspace and none from any other workspace.
2. **Given** a pending draft, **When** a reviewer approves, edits-and-approves, or
   rejects it, **Then** the draft's status changes accordingly and an approval row
   records target type, target id, reviewer, status, and notes.
3. **Given** any approval decision, **When** it is recorded, **Then** an audit log row
   is written.
4. **Given** an approved draft, **When** a reviewer marks it `published`, **Then** the
   status changes and no outbound publish call occurs — the mark is a record of manual
   action taken outside the app.
5. **Given** a viewer, **When** they attempt an approval decision, **Then** it is rejected.

---

### User Story 5 - Inbound lead capture and classification (Priority: P2)

An inbound lead arrives through an authenticated webhook. The system classifies its
segment and intent using only the workspace knowledge base, scores it, stores it, and
emails the owner when intent is high. It never sends anything to the lead.

**Why this priority**: Valuable but explicitly post-MVP-core in the scope ladder. It also
carries the highest misuse risk, so it ships after the approval gate is proven.

**Independent Test**: POST a lead to the ingest endpoint with valid credentials and
confirm a stored, classified lead plus an owner notification on high intent.

**Acceptance Scenarios**:

1. **Given** a valid authenticated webhook call, **When** a lead payload arrives, **Then**
   a lead row is stored in the correct workspace with its raw payload retained.
2. **Given** an unauthenticated or wrongly-credentialed call, **When** it hits the ingest
   endpoint, **Then** it is rejected and nothing is stored.
3. **Given** a stored lead, **When** classification runs, **Then** segment and intent are
   derived only from that workspace's knowledge base, and a score and stage are set.
4. **Given** a lead classified high intent, **When** classification completes, **Then**
   the workspace owner receives an email notification.
5. **Given** any lead in any state, **When** the system runs, **Then** no email, message,
   or contact of any kind is sent to the lead. (Constitution IV.)

---

### User Story 6 - Campaign draft through the same gate (Priority: P3)

An owner states a goal and audience. The system drafts positioning options, posts, an
email draft, and an experiment idea, and routes the whole thing through the identical
approval pipeline content uses.

**Why this priority**: Should-have. It composes existing pieces and adds no new safety
surface once approvals exist.

**Independent Test**: Submit a goal, confirm a campaign draft is produced and appears in
the same pending queue as content drafts.

**Acceptance Scenarios**:

1. **Given** a goal and audience, **When** the campaign bot runs, **Then** a campaign is
   saved containing positioning options, posts, an email draft, and an experiment idea.
2. **Given** a generated campaign, **When** it is saved, **Then** it enters the same
   approval pipeline and status vocabulary as content drafts.
3. **Given** a campaign containing an email draft, **When** it is approved, **Then** no
   email is sent by the system as a result of approval.

---

### Edge Cases

- A workspace has no claim set at all when a generation bot runs — generation must refuse
  rather than fall back to unbound prompts.
- A workspace's forbidden and approved claim lists contradict each other on the same
  phrase — forbidden wins.
- The daily AI run cap is reached mid-run by a concurrent request — the cap must hold
  under concurrency, not merely on a pre-check.
- The LLM provider times out, errors, or returns unparseable output — the run is logged
  as failed and produces no half-saved draft.
- A user is removed from a workspace while holding an open draft or pending approval —
  their access to those rows ends immediately.
- A user belongs to two workspaces — every read, run, and queue is scoped to the active
  one, with zero bleed.
- The same lead email arrives twice from different sources.
- A reviewer edits a draft so heavily on edit-and-approve that the stored payload no
  longer matches what the model produced — the audit trail must still show both.
- The last owner of a workspace is removed or demoted.

## Requirements *(mandatory)*

### Functional Requirements

**FR-K — Knowledge**
- **FR-K-001**: System MUST support create, read, update, and delete of knowledge docs
  scoped to a single workspace.
- **FR-K-002**: System MUST maintain, per workspace, an approved-claims list, a
  forbidden-claims list, and a brand voice.
- **FR-K-003**: System MUST inject the workspace's approved claims, forbidden claims, and
  brand voice into every generation prompt made for that workspace.
- **FR-K-004**: System MUST record `last_verified_at` on knowledge docs.

**FR-R — Research**
- **FR-R-001**: System MUST accept pasted feedback and competitor notes as free text.
- **FR-R-002**: System MUST output ranked opportunities in which each claim-bearing
  statement is labelled Fact, Inference, or Hypothesis.
- **FR-R-003**: System MUST save the report to the workspace and MUST NOT send it
  anywhere externally.

**FR-C — Content**
- **FR-C-001**: System MUST accept topic, platform, audience, length, and tone as input.
- **FR-C-002**: System MUST output hook, script, captions, titles, hashtags, CTA, and
  visual_plan.
- **FR-C-003**: System MUST create every content draft with status `awaiting_approval`.

**FR-A — Approvals**
- **FR-A-001**: Users MUST be able to list all items pending approval in their workspace.
- **FR-A-002**: Users MUST be able to approve, edit-and-approve, or reject a pending item
  with notes.
- **FR-A-003**: System MUST treat `published` as a manual status mark only and MUST NOT
  perform any publishing action. (Constitution I.)

**FR-L — Leads** *(phase: NEXT)*
- **FR-L-001**: System MUST ingest leads via an authenticated webhook/API.
- **FR-L-002**: System MUST classify segment and intent using only that workspace's
  knowledge base.
- **FR-L-003**: System MUST notify the workspace owner by email on high intent.
- **FR-L-004**: System MUST NOT send autonomous or cold email to leads. (Constitution IV.)

**FR-M — Campaigns** *(phase: THEN)*
- **FR-M-001**: System MUST turn a goal into positioning options, posts, an email draft,
  and an experiment idea.
- **FR-M-002**: System MUST route campaigns through the same approval pipeline as content.

**FR-S — System**
- **FR-S-001**: System MUST enforce workspace isolation via row-level security.
- **FR-S-002**: System MUST enforce a daily AI run cap per workspace.
- **FR-S-003**: System MUST write an audit entry for every AI run and every approval
  decision.
- **FR-S-004**: System MUST require an authenticated session and workspace membership for
  every API route.
- **FR-S-005**: System MUST keep LLM provider keys server-side only. (Constitution IX.)

### Resolved Clarifications

*Answered 2026-09-11.*

- **FR-Q-002** — **Daily AI run cap**: 50 runs per workspace per day, counting runs (not
  tokens), resetting at UTC midnight, owner-editable in Settings. Stored as
  `workspaces.daily_run_cap` (default 50).
- **FR-Q-006** — **Who may create a workspace**: seed/admin script only. There is no
  INSERT policy on `workspaces` for authenticated users; `npm run seed:workspace` creates
  them using the service-role key. SC-001 is satisfied by a seed row, which is not a code
  change.
- **FR-Q-007** — **How a second person joins**: the owner invites by email. An
  `invitations` row (workspace, email, role, token, invited_by, expires_at, accepted_at)
  is redeemed by the addressed account at `/invite/[token]`, which calls
  `accept_invitation()` and creates the membership. Invitations are owner-only to create;
  a token addressed to one email cannot be redeemed by another account.

### Assumptions Taken Without an Answer

*Implemented 2026-09-11 to unblock Phases 3-4. These were NOT decided by the product
owner — each is a defensible default, and each is cheap to change if wrong.*

- **FR-Q-001 — editor approval rights**: implemented as a per-membership `can_approve`
  flag that an owner toggles in Settings. Owners always approve; editors approve only when
  granted; viewers never. The spec's phrase "approve if permitted" reads as a grant, which
  is what this is. *If the intent was instead "editors may approve content but not
  campaigns", this becomes a per-target-type grant — a column change, not a redesign.*
- **FR-Q-003 — lead score and high-intent threshold**: score is 0-100; intent `high`
  requires >= 70, which is what triggers the owner notification.
- **FR-Q-004 — lead vocabularies**: fixed enums, because a classifier cannot be tested
  against free text. `segment`: student, parent, teacher, institution, partner, other,
  unknown. `intent`: high, medium, low, unknown. `stage`: new, classified, reviewing,
  contacted, qualified, archived. *Changing any of these is an enum migration.*

### Open Questions

- **FR-Q-005**: Telegram appears in the scope ladder ("THEN: campaigns, roles UI polish,
  Telegram") but has no requirement anywhere [NEEDS CLARIFICATION: what is it for —
  notifications to the team, or an input channel? Note that outbound messaging to
  non-team recipients is barred by Constitution IV.] **Not implemented.** No Telegram code
  exists, and `telegraf` / `node-telegram-bot-api` are blocked by
  `scripts/check-no-publish.mjs`.

### Key Entities

- **Workspace**: A tenant. `id`, `name`, `slug`, `created_at`. Every other entity belongs
  to exactly one.
- **Membership**: Links a user to a workspace with a role. `user_id`, `workspace_id`,
  `role` (owner | editor | viewer).
- **KnowledgeDoc**: A unit of product truth. `workspace_id`, `title`, `body`, `category`,
  `last_verified_at`.
- **ClaimSet**: The binding constraint on all generation. `workspace_id`,
  `approved_claims[]`, `forbidden_claims[]`, `brand_voice`.
- **ResearchReport**: Saved output of a research run. `workspace_id`, `input_blob`,
  `output_markdown`/`output_json`, `status`, `created_by`.
- **ContentDraft**: A generated content unit awaiting a human. `workspace_id`, `topic`,
  `platform`, `payload_json`, `status` (draft | awaiting_approval | approved | rejected |
  published).
- **Campaign**: A goal-level bundle of drafts. `workspace_id`, `goal`, `audience`,
  `payload_json`, `status`.
- **Lead**: An inbound contact. `workspace_id`, `source`, `email`, `segment`, `intent`,
  `score`, `stage`, `raw_payload`.
- **Approval**: A human decision on a target. `workspace_id`, `target_type`, `target_id`,
  `status`, `reviewer_id`, `notes`.
- **AuditLog / AiRunLog**: The record of what happened. `workspace_id`, `actor`, `action`,
  `meta`, tokens/cost when known.

## Non-Functional Requirements

- **NFR-001**: Team login is required for all UI.
- **NFR-002**: p95 draft generation is usable under 60s for typical prompts, when the
  provider allows.
- **NFR-003**: Zero cross-workspace data reads.
- **NFR-004**: A forbidden claim appearing in approved output is a defect.

## Scope Ladder

| Phase | Contents |
|---|---|
| MUST SHIP | Auth + workspace + membership, knowledge + claims, research, content, approvals, audit, AI caps |
| NEXT | Leads + email notify |
| THEN | Campaigns, roles UI polish, Telegram |

## API Surface (server)

| Route | Phase |
|---|---|
| `POST /api/ops/research/run` | MUST SHIP |
| `POST /api/ops/content/run` | MUST SHIP |
| `POST /api/ops/approvals/:id/decision` | MUST SHIP |
| `/api/ops/knowledge/*` (CRUD) | MUST SHIP |
| `POST /api/ops/leads/ingest` | NEXT |
| `POST /api/ops/campaigns/run` | THEN |

All routes require a session and workspace membership. LLM keys live only on the server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A second workspace can be created and used without any code change, even if
  the UI for it is minimal.
- **SC-002**: The Lumo workspace can produce a research report, a content draft, and an
  approval decision end to end.
- **SC-003**: A non-member receives zero rows for every table belonging to a workspace
  they do not belong to, demonstrated by an executable RLS test.
- **SC-004**: p95 draft generation completes under 60s for typical prompts.
- **SC-005**: No forbidden claim appears in any approved output.
- **SC-006**: 100% of AI runs and approval decisions have a corresponding audit entry.
- **SC-007**: No system-initiated outbound publish or contact occurs in any code path.
