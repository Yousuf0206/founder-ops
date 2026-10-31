---
id: 0027
title: Constitution Stale Name Refs
stage: misc
date: 2026-11-01
surface: agent
model: claude-opus-5
feature: none
branch: main
user: muhammad.yousuf02@gmail.com
command: none
labels: ["constitution", "branding", "docs"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - .specify/memory/constitution.md
tests:
  - none (prose-only change)
---

## Prompt

update the constitution references too

## Response snapshot

The constitution's binding content was already fully "Lumo Grow" (title, `App name:`).
All three stale hits were inside the dated Amendments log:

- line 167 (v3.1.0) "Renamed the product from **Lumo-Ops** to **Lumo Grow**" — LEFT AS IS.
- line 188 (v2.0.0) "Product renamed from \"Founder Ops\" to **Lumo-Ops**" — LEFT AS IS.
  Rewriting either makes the entry self-referential ("renamed from Lumo Grow to Lumo Grow")
  and destroys the record. The constitution's own line 169 sets this policy: applied
  migration headers and `history/` keep the old name as a dated record.
- line 198 (v1.1.0) "Founder Ops is a SaaS for any app" — CHANGED to "The product is a SaaS
  for any app". This asserted a still-true fact in the present tense using the dead name, so
  rewording removes the staleness without falsifying the dated entry.

Net: one line changed.

## Outcome

- ✅ Impact: Last stale present-tense use of the old product name removed; rename history
  left intact and legible.
- 🧪 Tests: None — prose only, no code path touched.
- 📁 Files: .specify/memory/constitution.md (1 line).
- 🔁 Next prompts: Decide whether a docs-only change warrants a push (it triggers a
  production rebuild on this git-connected project).
- 🧠 Reflection: A literal find-and-replace would have corrupted two amendment entries;
  reading the surrounding section before editing is what caught it.

## Evaluation notes (flywheel)

- Failure modes observed: None.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): N/A
