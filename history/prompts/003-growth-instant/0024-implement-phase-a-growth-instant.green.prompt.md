---
id: 0024
title: Implement Phase A Growth Instant
stage: green
date: 2026-09-17
surface: claude-code-cli
model: claude-opus-5
feature: 003-growth-instant
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [implementation, growth-instant, phase-a, claim-gate, forbidden-patterns, hurdles]
links:
  spec: specs/003-growth-instant/spec.md
  ticket: (none)
  adr: (none — one suggested, see Reflection)
  pr: (none)
files:
  - app/(growth)/hurdles/page.tsx (finished from an interrupted write)
  - lib/growth/analyze.ts (dropForbiddenHurdles, NoUsableHurdlesError)
  - lib/claims/forbidden-patterns.ts (invented-rank pattern fix)
  - lib/http/run-errors.ts (NoUsableHurdlesError → 422)
  - app/(growth)/start/actions.ts (NoUsableHurdlesError message)
  - tests/unit/growth-instant.test.ts (new, 22 cases)
  - specs/003-growth-instant/tasks.md (Phase A marked, decisions 3 and 5 recorded)
tests:
  - tsc --noEmit — clean
  - npm run check:public-env — clean
  - npm run check:publish-guards — 127 files clean
  - npx vitest run tests/unit — 180 passed (14 files), 22 of them new
  - npm run build — clean; /start and /hurdles both in the route table
  - integration suites — still skipped/failing: no TEST_SUPABASE_* database
---

## Prompt

implement

## Response snapshot

Read the working tree rather than starting fresh: Phase A of `specs/003-growth-instant`
was already substantially written and uncommitted, and one file
(`app/(growth)/hurdles/page.tsx`) existed only as an interrupted `.tmp.6848.*` write.
Finished the phase rather than restating it.

Three things were actually wrong, not merely missing:

1. **`hurdles/page.tsx` was never installed** — T-A6 looked undone but was complete in a
   temp file. Moved into place; it typechecks and builds.

2. **`runGrowthAnalysis` audited forbidden patterns but did not act on them.** The comment
   said violations were "stripped from the user-facing hurdles"; the code only wrote an
   audit entry and persisted the untouched list. Replaced with `dropForbiddenHurdles()`,
   which drops an offending hurdle WHOLE (word-level redaction leaves prose like "we
   results") and, when nothing survives, fails the run through a new `NoUsableHurdlesError`
   mapped to 422 with an honest retry message. Dropping can take the list under the 3 the
   schema demands — that floor governs what the MODEL must produce, not what survives
   safety filtering.

3. **The `invented-rank` pattern could never match `#1`.** It was written
   `/\b(?:#\s*1|…)/i`; `#` is not a word character, so a leading `\b` after a space never
   fires. Every `#1` in generated output passed the filter silently. Re-anchored with
   `(?!\d)` lookaheads, which also keeps `#10` and `no. 10` out. A test now pins it.

Also settled the two open decisions that blocked Phase A, conservatively, and recorded
each where the code makes it: workspace select reuses a user's most recent workspace and
only creates one for a user with no membership (decision 3); goal `other` is an inert
stored label, never interpolated as free text (decision 5). Decision 1 (pack storage)
still blocks Phase B and was deliberately left open.

## Outcome

- ✅ Impact: Phase A is code complete. A signed-in user can paste a URL and reach a
  hurdle list without ever visiting Claims — SC-02's whole point — with the global
  forbidden floor actually enforced on the way out, not just described.
- 🧪 Tests: 180 unit tests pass, 22 new in `tests/unit/growth-instant.test.ts` covering
  fact-bound prompt assembly, the refusal that remains, the pattern list, hurdle dropping,
  the 3–7 schema, and silent-workspace naming.
- 📁 Files: 7 touched; one new test file, one new page installed, no new dependencies.
- 🔁 Next prompts: settle plan Open Decision 1 (reuse `content_drafts` vs new pack tables)
  — it blocks T-B4 and most of Phase C. Then apply `0016` to a database and write the
  Phase A integration test.
- 🧠 Reflection: the claim gate coming down is the single most consequential change in
  v3.0.0 and is now spread across four files. It is ADR-shaped.

## Evaluation notes (flywheel)

- Failure modes observed: a regex whose leading `\b` made an alternative unreachable, and
  a comment describing behaviour the code did not have. Both were invisible to typecheck
  and to `next build`; only a test written from the requirement, not from the code, found
  them.
- Graders run and results (PASS/FAIL): typecheck PASS, public-env guard PASS,
  publish-guards PASS, unit suite PASS, integration suite NOT RUN (no database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): stand up `TEST_SUPABASE_*` against a local
  Supabase so Phase 0's 13 RLS cases and `product_facts`'s four policies stop being
  reviewed-not-proven.
