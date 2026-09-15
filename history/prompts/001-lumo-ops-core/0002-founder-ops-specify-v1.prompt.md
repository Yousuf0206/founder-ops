---
id: 0002
title: Founder Ops Specify v1
stage: spec
date: 2026-09-11
surface: claude-code-cli
model: claude-opus-5
feature: 001-founder-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [spec, founder-ops, lumo-learn, multi-workspace, rls]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/001-founder-ops-core/spec.md
tests:
  - (none)
---

## Prompt

# Founder Ops — Specify v1.0
WHAT we build. HOW is in plan.md. Tickets in tasks.md.

## 1. Problem
Small teams waste time on repetitive research, content, and lead handling, and risk
inconsistent or unsafe product claims when promoting apps like Lumo Learn.

## 2. Users
- Owner: full control of workspace
- Editor: create drafts, run bots, approve if permitted
- Viewer: read-only
Not users: end students/customers of the marketed product.

## 3. Entities (minimum)
### Workspace
id, name, slug, created_at

### Membership
user_id, workspace_id, role (owner|editor|viewer)

### KnowledgeDoc
workspace_id, title, body, category, last_verified_at

### ClaimSet
workspace_id, approved_claims[], forbidden_claims[], brand_voice

### ResearchReport
workspace_id, input_blob, output_markdown/json, status, created_by

### ContentDraft
workspace_id, topic, platform, payload_json, status
(draft|awaiting_approval|approved|rejected|published)

### Campaign
workspace_id, goal, audience, payload_json, status

### Lead
workspace_id, source, email, segment, intent, score, stage, raw_payload

### Approval
workspace_id, target_type, target_id, status, reviewer_id, notes

### AuditLog / AiRunLog
workspace_id, actor, action, meta, tokens/cost if known

## 4. Functional requirements
### FR-K Knowledge
- CRUD docs per workspace
- Maintain approved/forbidden claims + brand voice
- Inject claims into all generation prompts

### FR-R Research
- Accept pasted feedback/competitor notes
- Output ranked opportunities with Fact|Inference|Hypothesis labels
- Save report; no external send

### FR-C Content
- Input: topic, platform, audience, length, tone
- Output: hook, script, captions, titles, hashtags, CTA, visual_plan
- Land in awaiting_approval

### FR-A Approvals
- List pending items
- Approve / edit+approve / reject
- Publishing to social is manual outside the app (status mark only)

### FR-L Leads (post-MVP-core, still specified)
- Ingest via authenticated webhook/API
- Classify segment + intent from knowledge only
- Notify owner email on high intent
- No autonomous cold email

### FR-M Campaigns (should-have)
- Goal -> positioning options, posts, email draft, experiment idea
- Same approval pipeline as content

### FR-S System
- Workspace isolation via RLS
- Daily AI run cap per workspace
- Audit every run and approval

## 5. Non-functional
- Team login required for UI
- p95 draft generation usable under 60s for typical prompts when provider allows
- Zero cross-workspace data reads
- Forbidden claim appearing in approved output = defect

## 6. MVP scope
MUST SHIP: auth + workspace + membership, knowledge + claims, research, content,
approvals, audit, AI caps.
NEXT: leads + email notify.
THEN: campaigns, roles UI polish, Telegram.

## 7. API surface (server)
- POST /api/ops/research/run
- POST /api/ops/content/run
- POST /api/ops/campaigns/run (phase)
- POST /api/ops/leads/ingest (phase)
- POST /api/ops/approvals/:id/decision
- CRUD knowledge under /api/ops/knowledge/*

All require session + workspace membership. LLM keys only on server.

## 8. Acceptance (product-level)
- Second workspace can be created without code change (even if UI is minimal)
- Lumo workspace can produce research report + content draft + approval
- Non-member cannot read workspace rows (RLS proof)

## Response snapshot

Wrote `specs/001-founder-ops-core/spec.md` in the Spec-Kit template shape. Mapped the
six FR groups into six prioritized, independently testable user stories (P1: knowledge
base, research, content, approvals; P2: leads; P3: campaigns) with Given/When/Then
acceptance scenarios. Preserved all entities, NFRs, the scope ladder, and the API surface
verbatim in substance, tagging each route with its phase. Turned the three product-level
acceptance items into SC-001..SC-003 and added SC-004..SC-007 from the NFRs and the
constitution's audit and no-auto-publish requirements. Added nine edge cases and seven
[NEEDS CLARIFICATION] open questions (FR-Q-001..007). No branch created, no code written.

## Outcome

- Impact: The WHAT is now a written, testable spec under `specs/001-founder-ops-core/`.
- Tests: none yet (spec stage; acceptance scenarios written to be executable later)
- Files: `specs/001-founder-ops-core/spec.md` (new)
- Next prompts: answer FR-Q-001..007, then `/sp.plan` for the HOW (schema, RLS policies, prompt assembly, cap enforcement).
- Reflection: Two gaps in the source spec were structural rather than cosmetic — there is no invitation/join path for a second member, and no numeric AI run cap despite the constitution making caps mandatory.

## Evaluation notes (flywheel)

- Failure modes observed: bash heredoc write failed under Git Bash on Windows; fell back to the Write tool.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
