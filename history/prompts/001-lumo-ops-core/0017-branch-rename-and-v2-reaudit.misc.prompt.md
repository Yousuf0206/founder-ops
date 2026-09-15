---
id: 0017
title: Branch Rename And V2 Reaudit
stage: misc
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: 001-lumo-ops-core
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [rename, branch, reaudit, constitution-v2, superseded, publish-modes]
links:
  spec: specs/001-lumo-ops-core/spec.md
  ticket: (none)
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: (none)
files:
  - specs/001-lumo-ops-core/ (renamed from specs/001-founder-ops-core/)
  - history/prompts/001-lumo-ops-core/ (renamed from history/prompts/001-founder-ops-core/)
  - specs/001-lumo-ops-core/v2-conformance-audit.md (new)
  - specs/001-lumo-ops-core/spec.md
  - specs/001-lumo-ops-core/plan.md
  - specs/001-lumo-ops-core/tasks.md
  - specs/001-lumo-ops-core/self-audit.md
  - history/adr/0001-membership-and-workspace-creation.md
tests:
  - (none — directory rename and documents only; no code touched)
---

## Prompt

yes change the rename the branch and directory. beside yes reaudit it but we will work on v2 from now on. v1 is no more in work

## Response snapshot

**Renames.** `git mv` on both feature directories: `specs/001-founder-ops-core` →
`specs/001-lumo-ops-core` and `history/prompts/001-founder-ops-core` →
`history/prompts/001-lumo-ops-core`.

The branch turned out not to be named what the docs claimed. There is no
`001-founder-ops-core` branch — `spec.md` and `plan.md` named it as the feature
branch, but the actual branches are `main`, `google-auth`, and
`founder-ops-phases-1-5`. Renamed the one carrying the old product name locally:
`founder-ops-phases-1-5` → `lumo-ops-phases-1-5`.

Slug references updated in live documents (`specs/001-lumo-ops-core/*.md`) and in
ADR-0001's link targets so they still resolve after the move. PHR bodies were left
verbatim — they are the historical record of what the paths were at the time, and
rewriting them would falsify it.

**Two things not done, both outward-facing:** the remote still has
`origin/founder-ops-phases-1-5` (renaming there means pushing a new branch and
deleting the old one), and the GitHub repository itself is still
`Yousuf0206/founder-ops`. Both surfaced to the user rather than actioned.

**Re-audit.** Wrote `specs/001-lumo-ops-core/v2-conformance-audit.md` as a new
document rather than editing v1's contents, then marked `spec.md`, `plan.md`,
`tasks.md`, and `self-audit.md` with a CLOSED/superseded banner pointing at it, and
changed `spec.md` Status from `Draft` to `Closed — superseded by Constitution v2.0.0`.

Core finding: v1 is not merely missing v2 features — its central safety property is
v2's inverse. 14 direct conflicts catalogued (C1–C14). The one that blocks work today
is C1: `scripts/check-no-publish.mjs` runs inside `npm run check` and fails the build
if `googleapis`, `twitter-api-v2`, `linkedin-api-client` or `@tiktok/*` enter
`package.json` — i.e. the v1 guard now blocks v2's own roadmap. Recommended rewriting
it as `check-publish-guards.mjs` (single publish module, no send path that skips the
claim check or cap, bulk-messaging block retained) rather than deleting it, and leaving
it in place until then so it fails loudly at exactly the moment the decision is due.

Also catalogued: nine v1 mechanisms v2 inherits unchanged and should not rebuild
(prompt assembly with a required claim set, forbidden-claim output scan, `workspace_id`
+ forced RLS on 13 tables, `claim_ai_run()` advisory-lock cap, `decide_on_draft()`
atomic audit, SECURITY-DEFINER-only log writes, the public-env CI check, invitations +
`can_approve`, secret-resolved ingest), and twelve things v2 needs that have no v1
equivalent at all (connected accounts, publish mode, publish execution + scheduling,
publish caps, publish audit, auto-publish rules, metrics pull, next-action
recommendation, product-URL analysis, campaign scoring, agent-proposed knowledge
updates, dogfood criterion).

## Outcome

- ✅ Impact: The `founder-ops` name is gone from every local identifier except the
  remote branch and the GitHub repo name. v1 core is formally closed with a machine-
  readable conflict list, so v2 work starts from a stated inheritance boundary rather
  than from a rediscovery of it.
- 🧪 Tests: none run — this change touched directories and markdown only. The prior
  typecheck-clean / build-exit-0 state from PHR 0016 is unaffected.
- 📁 Files: 2 directories renamed, 1 audit document created, 5 documents banner-marked
  or link-fixed, 1 local branch renamed.
- 🔁 Next prompts: `/sp.specify` a `002-*` feature against v2.0.0 — connected accounts +
  publish mode + the guarded publish path, with the CI guard replaced in the same slice;
  decide the remote-branch and repo rename; start local Supabase to convert the 53
  skipped integration tests into real signal before building on top of unproven RLS.
- 🧠 Reflection: The audit's most useful output was not the list of missing features but
  C1 — a passing CI check that had silently become a blocker. A constitution flip can
  leave *enforcement* mechanisms behind that still work perfectly and now defend the
  wrong invariant.

## Evaluation notes (flywheel)

- Failure modes observed: the spec documents asserted a feature branch
  (`001-founder-ops-core`) that never existed in git, so "rename the branch" could not be
  taken literally — checking `git branch -a` before acting is what caught it.
- Graders run and results (PASS/FAIL): (none — no code changed)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): before writing the 002 spec, run
  `npm run check` once and confirm it still passes — it should, since no publishing SDK
  is present yet, which is precisely the window in which to replace the guard.
