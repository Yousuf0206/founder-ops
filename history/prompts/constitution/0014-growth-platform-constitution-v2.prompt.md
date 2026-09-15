---
id: 0014
title: Growth Platform Constitution v2
stage: constitution
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: (none)
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [constitution, governance, growth-platform, breaking-change, publishing]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: (none)
files:
  - .specify/memory/constitution.md
tests:
  - (none)
---

## Prompt

# Growth Platform — Constitution v2.0
Status: BINDING
Product type: B2B multi-tenant growth platform (not a student learning app)

## 1. Vision
Teams connect a product or niche and get multiplied output across research,
strategy, media, publishing, lead intake, and learning—without hiring in
linear proportion to content volume. Control (claims, roles, approvals, caps,
audit) scales from solo founder to large teams.

## 2. Non-negotiable principles
1. Product truth first: every workspace has knowledge + approved/forbidden claims + voice.
2. No invented product facts. If unknown, say unknown; refuse unsafe claims.
3. Distribution is in scope: publish/schedule only to accounts the workspace connects.
4. Humans set the mode: draft-only | approve-then-publish | auto-within-rules.
5. Auto-publish never bypasses claim checks or daily caps.
6. No scraping strangers for cold spam; leads are inbound or explicitly compliant sources.
7. Multi-workspace isolation is absolute (RLS / equivalent).
8. Every AI run, publish action, and approval is audited.
9. Platform works for team sizes 1→N via roles—not separate products.
10. Dogfood: Lumo must be runnable as a workspace; if founders won't use it, scope is wrong.

## 3. Agent boundaries
IN: analyze public product URL/content, R&D from inputs, score campaign ideas,
    multi-platform drafts, publish via OAuth, ingest inbound leads, pull metrics,
    recommend next actions, update knowledge with human confirm.
OUT (v2.0 launch): mass unsolicited outreach, posting to non-owned accounts,
    guaranteed rank/revenue claims, silent publish with no mode/caps.

## 4. Safety levels
- Low: internal research, drafts, classification → auto
- Medium: single publish to connected account after approval → one-click or queue
- High: auto-publish rules, secret rotation, role changes → owner only
- Blocked: bulk unsolicited messaging, claim-violating copy

## 5. Stack defaults
- Next.js + TypeScript + Tailwind
- Supabase Auth + Postgres + RLS
- Server-side LLM
- Vercel
- Channel connectors via official OAuth APIs where available
- Email for notifications

## 6. Self-audit each task
- Does this multiply team output or only create orphan drafts?
- Claims enforced?
- Workspace-scoped?
- Publish path explicit and authorized?
- Measurable outcome possible?

## Response snapshot

Rewrote `.specify/memory/constitution.md` from "Founder Ops Constitution" v1.1.0 to
"Growth Platform Constitution" v2.0.0, mapping the ten pasted principles onto the
existing house style (numbered `### I.`–`### X.` principles, Agent Boundaries,
Safety Levels table, Stack Defaults, Governance + self-audit + amendment log).

Identified one breaking change against v1.x and recorded it explicitly in the
amendment entry: v1 Principle I ("Draft, Never Auto-Publish — NON-NEGOTIABLE") is
superseded by v2 Principles III–V (distribution in scope; human-set publish mode;
auto-publish still bound by claim checks and daily caps). Flagged that v1-era code
or specs that hard-refuse all publishing must be revisited.

Carried forward from v1.1.0 rather than dropped: prompt-construction claim
enforcement (now II), `workspace_id` on every table/query/policy/AI run with RLS
(now VII), audit log fields (now VIII), daily caps as bugs-not-backlog (folded into
V), and server-side-only LLM keys (folded into Stack Defaults). The v1.1.0 amendment
entry was preserved in the log.

## Outcome

- ✅ Impact: Constitution is now v2.0.0 and BINDING; publishing/scheduling is in scope
  under explicit modes, and the self-audit checklist changed from five draft-only
  questions to five output/claims/scope/publish-path/measurability questions.
- 🧪 Tests: (none — governance document, no code paths touched)
- 📁 Files: `.specify/memory/constitution.md` rewritten (v1.1.0 → v2.0.0)
- 🔁 Next prompts: audit `specs/001-founder-ops-core/` and existing app code against
  v2.0 Principles III–V (publish modes, connected-account OAuth, caps on auto-publish);
  consider an ADR for the publish-mode state machine and connector token storage.
- 🧠 Reflection: A major version bump that flips a NON-NEGOTIABLE principle needs the
  reversal written into the amendment log, not just the new text — otherwise v1-era
  refusal logic silently contradicts the live constitution.

## Evaluation notes (flywheel)

- Failure modes observed: none in this task; the risk was silently dropping v1
  guardrails (caps, server-side keys, audit fields) that v2.0's shorter prose implies
  but does not restate.
- Graders run and results (PASS/FAIL): (none)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): grep the codebase for hard-coded
  draft-only refusals and list them as v2.0 conflicts before writing new specs.
