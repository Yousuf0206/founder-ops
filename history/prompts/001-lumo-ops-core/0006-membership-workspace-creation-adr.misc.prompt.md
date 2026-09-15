---
id: 0006
title: Membership Workspace Creation ADR
stage: misc
date: 2026-09-11
surface: agent
model: claude-opus-5
feature: 001-founder-ops-core
branch: 001-founder-ops-core
user: Yousuf0206
command: /sp.adr membership-and-workspace-creation
labels: [adr, architecture, rls, membership, invitations, multi-tenancy]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: null
  adr: history/adr/0001-membership-and-workspace-creation.md
  pr: null
files:
  - history/adr/0001-membership-and-workspace-creation.md
tests:
  - "(none — documentation)"
---

## Prompt

/sp.adr membership-and-workspace-creation

## Response snapshot

Created `history/adr/0001-membership-and-workspace-creation.md` (first ADR; `history/adr/`
did not exist).

Treated membership and workspace creation as one decision cluster rather than two ADRs,
per the command's clustering rule: they were decided together, they are enforced by the
same migration, and they would change together — self-serve workspace creation would
immediately alter how memberships are obtained.

Documented the decision as three mechanisms: no INSERT policy on `workspaces` for
authenticated users; an owner-only `invitations` table redeemed through a `SECURITY
DEFINER` `accept_invitation()` that re-checks email ownership; and `SECURITY DEFINER`
membership helpers so `memberships` policies do not recurse into their own RLS check.

Recorded all four alternatives that were on the table when the question was asked (owner
adds existing user; Supabase built-in invite; defer to seed-only; self-serve creation),
each with the specific reason it was rejected. Five negative consequences recorded,
including two that are genuine standing costs: five `SECURITY DEFINER` functions are a
permanent audit target, and email identity is assumed stable across the invitation
lifetime.

The run-cap decision (50/day, run-count over token budget) is noted in the same ADR
because it landed in the same migration, with a flag that its Phase 2 enforcement
mechanism may warrant a separate ADR.

Also confirmed the spec-kit prerequisites script now resolves correctly after the branch
rename: FEATURE_DIR = `specs/001-founder-ops-core`.

## Outcome

- ✅ Impact: The Phase 0 schema decisions now have a permanent rationale record, including the rejected options.
- 🧪 Tests: none (documentation)
- 📁 Files: `history/adr/0001-membership-and-workspace-creation.md` (new)
- 🔁 Next prompts: close the Phase 0 verification gap (stand up Supabase, apply migration, run the 13 RLS tests), then Phase 1 Knowledge.
- 🧠 Reflection: The ADR's significance test passes on all three counts — long-term impact (schema + security model), multiple viable alternatives (four), cross-cutting scope (every table in every later phase inherits this RLS pattern).

## Evaluation notes (flywheel)

- Failure modes observed: none. Checked against the command's two named failure modes — not over-granular (one cluster, not separate ADRs for invitations and workspace creation), and alternatives are listed with rationale (four).
- Graders run and results (PASS/FAIL): clustering PASS; alternatives-listed PASS; pros-and-cons PASS; concise-but-sufficient PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
