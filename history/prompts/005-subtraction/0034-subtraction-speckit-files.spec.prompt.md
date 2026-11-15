---
id: 0034
title: Subtraction Speckit Files
stage: spec
date: 2026-11-15
surface: agent
model: claude-opus-5
feature: 005-subtraction
branch: main
user: yousuf0206
command: write the specs/005-subtraction files
labels: ["subtraction", "speckit", "spec", "plan", "tasks"]
links:
  spec: specs/005-subtraction/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/005-subtraction/spec.md
 - specs/005-subtraction/plan.md
 - specs/005-subtraction/tasks.md
 - history/prompts/005-subtraction/0033-subtraction-nav-and-results-merge.green.prompt.md
tests:
 - none (documentation only; the code gates from PHR 0033 still stand)
---

## Prompt

write the specs/005-subtraction files

## Response snapshot

Wrote the three speckit files in the 003/004 house style, after reading those milestones
for structure and status vocabulary.

- **spec.md** — the owner's constitution-derived promise, US1–US5, and SC-01..SC-07 /
  FR-01..FR-10 / NFR-01..NFR-03 reproduced as given. A provenance note records that the
  paste was truncated inside sp.plan and that sp.tasks never arrived, so the reader can
  tell owner instruction from reconstruction. A dedicated section records the ratified
  FR-07 reading (*bury nav only*) with the rejected URL-relocation alternative and its
  cost, so the decision is not re-litigated from the bare requirement text. Closes with
  what the milestone deliberately refuses to add — tour, wizard, checklist, settings
  panel, third tab.
- **plan.md** — the owner's Target IA block kept verbatim, then six phases: audit what
  recovery already satisfied, merge, Copy, cut the nav, sweep links, pin the contract.
  Architecture stance states the merge is UI-only (no schema change, pack posts stay
  `content_drafts` so publish guardrails hold) and the delete-vs-demote rule: routes a user
  could be mid-flow in lose their nav entry, routes whose content moved get deleted and
  redirected. A decisions table carries the six calls worth defending, each with its
  rejected alternative, plus a risks table whose top entry is the nav regrowing one
  reasonable entry at a time.
- **tasks.md** — reconstructed from the delivered work, 40 tasks across six phases, in 004's
  status vocabulary. Phase 0 marks the seven things recovery already satisfied as verified
  so none gets rebuilt. Phases 1–5 are `[~]` code-complete, honestly: the work is in the
  working tree on top of `f7f59be`, uncommitted and undeployed, so no UI claim is marked
  verified. T-0.7 records the Vercel `403 forbidden` on env listing and that `/api/health`
  was used instead. T-5.3 records the integration suites as unrun for want of a reachable
  Supabase — the same state 004 recorded. Phase 6 is the production proof, every task
  `[owner]`, ending in R3's real test: a non-engineer reaching a copied post unaided.
  Closes with the R10 self-audit, both questions answered.

PHR 0033 amended to link the spec and to point forward to this record.

## Outcome

- ✅ Impact: the milestone is now documented at the same grain as 003 and 004, with the
  truncation and the FR-07 ratification on the record rather than in a chat log.
- 🧪 Tests: none — documentation. The gates from 0033 (typecheck, both guard scripts, 226
  unit tests, build) are unchanged and still green.
- 📁 Files: 3 added, 1 amended.
- 🔁 Next prompts: commit and deploy, then walk Phase 6 T-6.2..T-6.5 on production against
  https://lumo-learn.com.
- 🧠 Reflection: the honest `[~]` on everything shipped-but-undeployed is the point of 004's
  vocabulary; marking UI work `[x]` before a deployment serves it would make the document
  worth less than no document.

## Evaluation notes (flywheel)

- Failure modes observed: none in this step.
- Graders run and results (PASS/FAIL): n/a — no code changed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after Phase 6, record how long the production
  path took end to end and whether the non-engineer needed a word of help.
