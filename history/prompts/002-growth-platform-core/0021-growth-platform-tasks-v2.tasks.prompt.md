---
id: 0021
title: Growth Platform Tasks V2
stage: tasks
date: 2026-09-16
surface: claude-code-cli
model: claude-opus-5
feature: 002-growth-platform-core
branch: main
user: Yousuf0206
command: /speckit.tasks
labels: [tasks, phase-gate, publish-path, inherited-v1, migrations]
links:
  spec: specs/002-growth-platform-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - specs/002-growth-platform-core/tasks.md
tests:
  - (none — planning document)
---

## Prompt

---

## `/speckit.tasks`

```markdown
# Growth Platform — Tasks v2.0

## Phase 0 — Core
- [ ] T0.1 App shell + Supabase auth
- [ ] T0.2 workspaces, memberships, invites, RLS
- [ ] T0.3 knowledge_docs + claim_sets; block AI if no approved claims
- [ ] T0.4 Roles + approval grant flag
- [ ] T0.5 AI run cap (50/day UTC default)
- [ ] T0.6 Audit log
- [ ] T0.7 Seed Lumo workspace + forbidden starter claims
**DoD:** Team login, Lumo workspace, claims editable, isolation tested

## Phase 1 — Brain
- [ ] T1.1 Onboarding: niche, URL, goals
- [ ] T1.2 analyze_run (public fetch + summary)
- [ ] T1.3 research_reports (Fact/Inference/Hypothesis)
- [ ] T1.4 strategy_ideas with impact/effort/confidence
- [ ] T1.5 media content_drafts multi-platform package
- [ ] T1.6 Approvals inbox (approve / edit+approve / reject)
**DoD:** End-to-end draft path without publish

## Phase 2 — Publish vertical
- [ ] T2.1 connected_accounts table + encrypted tokens
- [ ] T2.2 OAuth connect flow (network #1)
- [ ] T2.3 publish_jobs state machine
- [ ] T2.4 Approve → publish now
- [ ] T2.5 Approve → schedule (cron/worker)
- [ ] T2.6 UI: job status, errors, retry
- [ ] T2.7 Claim check before enqueue publish
**DoD:** Real post or scheduled post from approved draft on network #1

## Phase 3 — Modes & scale controls
- [ ] T3.1 workspace mode: draft_only | approve_then_publish | auto_within_rules
- [ ] T3.2 publish caps /day
- [ ] T3.3 Auto path still runs claim + cap checks
- [ ] T3.4 Member invite + grant approval UX
**DoD:** Documented modes; auto cannot exceed caps

## Phase 4 — Leads & learn
- [ ] T4.1 leads ingest + score + high-intent email
- [ ] T4.2 Lead stages + manual task notes
- [ ] T4.3 Fetch basic metrics for published posts where API allows
- [ ] T4.4 Learn report: top posts + next topic suggestions
- [ ] T4.5 Propose knowledge updates (require accept)
**DoD:** Closed loop visible on Home

## Phase 5 — Expand
- [ ] T5.1 Connector #2
- [ ] T5.2 Draft templates for networks without publish yet
- [ ] T5.3 Workspace limits per plan (config)
- [ ] T5.4 Dogfood checklist: 2 weeks Lumo content via platform
**DoD:** SC-001–007 signed off

## Non-tasks (v2.0)
- Cold email/DM scraping sequences
- Guaranteed KPI contractual claims in-product
- Building all six publish APIs before first real publish

## Response snapshot

Wrote `specs/002-growth-platform-core/tasks.md` (257 lines, 57 tasks, 24 added) from the
outline, reconciled against spec.md, plan.md, decisions-2026-09-15.md, and the v1 code.
Kept the outline's phase and T-number structure; added file paths and story labels.
Marked inherited v1 tasks as verify-only. Added a Phase 0 exit gate (local Supabase +
0 skipped integration tests), the plans/settings migration, SSRF-safe URL fetch, a single
publish write path, guard-script rewrite in the connector PR, and removal of v1 manual
"mark published". Moved publish-cap enforcement from Phase 3 into Phase 2 (Constitution V).
T0.3 now refuses on an empty approved list (decisions §7; v1 allowed it). Migrations
renumbered from 0008 because 0007 exists. Phase 5 DoD corrected to SC-001–009.

## Outcome

- ✅ Impact: tasks.md exists; every outline item mapped, with deviations tabled
- 🧪 Tests: none run — planning document
- 📁 Files: specs/002-growth-platform-core/tasks.md
- 🔁 Next prompts: T0.8 local Supabase + T0.11 test gate; answer B1, B2, FR-Q-107 before Phase 2
- 🧠 Reflection: most Phase 0/1 outline items already exist in v1; the real work is verification

## Evaluation notes (flywheel)

- Failure modes observed: check-prerequisites.ps1 fails on branch `main` (expects feature branch)
- Graders run and results (PASS/FAIL): (none)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): run /sp.analyze across spec/plan/tasks for drift
