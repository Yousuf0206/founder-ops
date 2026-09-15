---
id: 0018
title: Growth Platform Specify V2
stage: spec
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: 002-growth-platform-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [spec, constitution-v2, publish-modes, connectors, oauth, growth-platform]
links:
  spec: specs/002-growth-platform-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/002-growth-platform-core/spec.md
tests:
  - (none — specification document)
---

## Prompt

# Growth Platform — Specify v2.0

## 1. Problem
Small and mid teams cannot produce consistent multi-channel growth work without
either burning founder time or hiring faster than revenue. Large teams struggle
with brand consistency, approvals, and audit. Tools that only draft fail adoption;
tools that spam fail trust and platform policy.

## 2. Users
- Owner / admin (billing, connectors, modes, caps)
- Editor (run agents, draft)
- Approver (may be editor with grant)
- Viewer (read-only)
- Agency operator (many workspaces)
Buyer: founder, marketing lead, agency.

## 3. Core loop (required)
Product/niche + knowledge
  → Analyze & R&D
  → Scored campaign ideas
  → Multi-platform assets
  → Approve or auto-rules
  → Publish/schedule
  → Measure
  → Recommend + update knowledge (human confirm for claim changes)

## 4. Workspaces
- One workspace = one product/brand
- Onboarding: name, slug, niche, primary URL, goals, tone
- Invites by email; roles owner | editor | viewer
- Editor approval via explicit grant
- Create workspace: authenticated user with plan limits (e.g. max workspaces)

## 5. Functional requirements

### FR-K Knowledge & claims
- Docs CRUD; claim set required before generation/publish
- Forbidden overrides approved
- Brand voice injected into prompts

### FR-O Onboarding & analyze
- Inputs: niche, URL, goals, audience
- Fetch/summarize public pages (respect robots/rate limits)
- Output: product summary, themes, content gaps, risks vs claims

### FR-R Research
- Paste or import feedback/competitor notes
- Ranked opportunities; Fact | Inference | Hypothesis

### FR-S Strategy
- Campaign ideas scored impact / effort / confidence (0–100 or 1–5 scale documented)
- Link ideas to evidence

### FR-M Media
- Platforms: Instagram, Facebook, LinkedIn, TikTok, X, YouTube (draft all; publish per connector availability)
- Package: hook, script/body, captions, titles, hashtags, CTA, visual plan
- Platform-native length/tone variants

### FR-P Publish
- OAuth connect per workspace
- Modes: draft_only | approve_then_publish | auto_within_rules
- Caps: max publishes/day/workspace; AI runs/day (default 50 UTC, owner-editable)
- Approve → publish or schedule now/later
- Status: draft → awaiting_approval → approved → scheduled → published | failed | rejected
- No social SDK that posts without this state machine

### FR-L Leads
- Inbound webhook (secret per workspace)
- Segment enum, score 0–100, high intent ≥ 70 → notify team email
- Stages for triage; tasks “contact manually”
- No autonomous email/DM to lead in v2.0 unless separately specified compliant sequence

### FR-LRN Learn
- Ingest publish results + available metrics from connectors
- Weekly or on-demand “what worked” summary
- Suggest next topics; propose knowledge edits (require human accept)

### FR-A Control plane
- Approvals queue, audit log, AI run log, member management
- Plan-aware limits (workspaces, seats, publishes)—even if billing later

## 6. Non-functional
- RLS isolation SC: zero cross-workspace reads
- Claim violation in published body = defect
- Publish requires valid connector + mode permission
- Team-ready: invite second user within first session path

## 7. Success criteria (platform)
- SC-001 Second user joins via invite and works in same workspace
- SC-002 Generation blocked without approved claims
- SC-003 Full loop: idea → draft → approve → publish to ≥1 connected network
- SC-004 Metrics or publish receipt visible after publish
- SC-005 Second workspace isolated
- SC-006 Auto mode never exceeds caps; never posts forbidden claims
- SC-007 SMB can complete first publish in <30 minutes after connecting one channel

## 8. Out of scope v2.0 launch
- Guaranteed ranking/sales outcomes
- TikTok/X/YouTube publish if API access blocked (still draft)
- Full ad-bid management
- Training on private app backends without user-provided access

## Response snapshot

Wrote `specs/002-growth-platform-core/spec.md` in the Spec-Kit template shape, governed by
Constitution v2.0.0, superseding `001-lumo-ops-core` and linking to its conformance audit
so the inheritance boundary is explicit rather than rediscovered.

Nine prioritized, independently testable user stories covering the required core loop:
onboarding+analyze (P1), connect channel + set mode (P1), multi-platform assets (P1),
approve→publish/schedule (P1), auto-within-rules (P2), measure→learn→propose (P2), team
invite + approval grant (P1), scored ideas from research (P2), leads triage (P3). Auto mode
is deliberately P2 behind the approval path — its guardrails *are* the approval path's
guardrails plus a rule engine, so shipping it first would mean building the rule engine on
unproven enforcement.

Requirements grouped on the input's own prefixes (FR-K/O/R/S/M/P/L/LRN/A) plus FR-SYS for
the cross-cutting v1 inheritance. Marked which groups are inherited rather than new.

**Three interpretations resolved in the spec rather than left vague:**
- "Approver (may be editor with grant)" is not a fourth role — it is v1's existing
  `can_approve` per-membership flag. Roles stay owner | editor | viewer.
- "Agency operator (many workspaces)" is a usage pattern, not a role. Constitution VII
  permits a switcher over one's own memberships but no cross-workspace aggregate read.
- The v1 spec's "Not users: end students/customers — Constitution V, team-only" was stale
  twice over. Restated: the marketed product's audience are who content is *about*, never
  accounts on the platform.

**Three assumptions recorded as assumptions, not decisions:** 0–100 per scoring axis (the
input allowed either scale "documented"; 0–100 matches the existing lead score, giving one
numeric vocabulary); an auto-publish writes an approval row attributed to the rule (else it
is the one unattributed action in a system whose Principle VIII audits every approval and
publish); the claim check runs on the final body after reviewer edits (checking the model's
original would leave the edited body unchecked).

**Eight open questions raised rather than guessed**, each with the phase it blocks —
FR-Q-101 launch connector set (and whether any needs platform review started now),
FR-Q-102 auto-rule dimensions (the entire safety surface of Principle V; cannot be inferred
from "within rules"), FR-Q-103 publish-cap default and whether it is per-platform or
aggregate, FR-Q-104 plan tiers and how a plan is assigned before billing exists, FR-Q-105
metrics scope and refresh cadence, FR-Q-106 weekly-summary trigger and timezone, FR-Q-107
failed-publish retry policy (automatic retry raises the duplicate-post risk), FR-Q-108
whether the agency surface wants more than a switcher.

FR-P-009 carries the conformance audit's C1 forward as a requirement: no platform SDK may
post outside the state machine, and v1's `scripts/check-no-publish.mjs` must be *rewritten*
in the same slice that adds the first connector, never deleted ahead of it.

Edge cases were extended beyond the input with the ones the publish surface introduces:
lost platform response (receipt as idempotency anchor), token revoked between approval and
scheduled time, partial multi-platform publish needing per-platform status, mode switched
to draft_only while items are scheduled, and a forbidden claim added *after* something
containing it was published.

Success criteria carry the input's SC-001–007 plus SC-008 (audit coverage including auto
mode), and a stated verification debt: SC-005 and SC-006 rest on v1 mechanisms that have
never run against a database, so running them is a prerequisite of this feature.

## Outcome

- ✅ Impact: v2.0 has a written, testable spec with an explicit v1 inheritance boundary, so
  the next step is a plan rather than an archaeology exercise. Eight named blockers are now
  visible before implementation instead of during it.
- 🧪 Tests: none — specification document.
- 📁 Files: `specs/002-growth-platform-core/spec.md` (new)
- 🔁 Next prompts: answer FR-Q-101 through FR-Q-104 (the four that block the MUST SHIP row);
  `/sp.plan`; the publish-mode + connector-token ADR; start local Supabase and clear the 53
  skipped integration tests before building the publish path on unproven RLS. No git branch
  was created for this feature — say if you want `002-growth-platform-core` cut from `main`.
- 🧠 Reflection: the input's most dangerous phrase was "auto_within_rules", because it reads
  like a settled feature while the rule shape — the actual safety surface Principle V
  governs — is entirely unspecified. Writing it as a blocking question rather than inventing
  rule dimensions is the difference between a spec and a guess.

## Evaluation notes (flywheel)

- Failure modes observed: the tempting failure was treating "Approver" and "Agency operator"
  as new roles, which would have added a role hierarchy the constitution does not have and
  a cross-workspace read Principle VII forbids.
- Graders run and results (PASS/FAIL): (none — no code)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): before `/sp.plan`, confirm the launch connector
  set (FR-Q-101) — it determines whether the first slice is a Meta connector or a LinkedIn
  one, and platform review lead times can gate the whole schedule.
