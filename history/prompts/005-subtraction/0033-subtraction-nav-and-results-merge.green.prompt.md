---
id: 0033
title: Subtraction Nav And Results Merge
stage: green
date: 2026-11-15
surface: agent
model: claude-opus-5
feature: 005-subtraction
branch: main
user: yousuf0206
command: (pasted speckit set 6.0.0-subtraction — constitution + specify + truncated plan; implement)
labels: ["subtraction", "navigation", "results", "copy", "speckit"]
links:
  spec: specs/005-subtraction/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - app/(growth)/layout.tsx
 - app/(growth)/results/page.tsx
 - app/(growth)/results/results-tabs.tsx
 - app/(growth)/results/copy-post.tsx
 - app/(growth)/results/pack-post.tsx
 - app/(growth)/results/generate-pack.tsx
 - app/(growth)/results/actions.ts
 - app/(growth)/start/actions.ts
 - app/(growth)/next/page.tsx
 - app/(growth)/publish/page.tsx
 - app/(growth)/publish/actions.ts
 - next.config.ts
 - tests/unit/nav-contract.test.ts
 - (deleted) app/(growth)/hurdles/page.tsx
tests:
 - npm run typecheck (pass, after clearing stale .next/types)
 - npm run check:public-env (pass)
 - npm run check:publish-guards (pass — 143 files clean)
 - npx vitest run tests/unit (226 passed, 18 files — includes new nav-contract suite)
 - npx vitest run tests/integration (8 files fail at setup, 120 skipped — no reachable Supabase locally, pre-existing)
 - npm run build (pass; /results in the route table, /hurdles and /pack gone)
 - curl https://lumo-ops.vercel.app/api/health → ai.configured true (groq), migrations applied (SC-05)
---

## Prompt

# Lumo Grow — Speckit Set (Subtraction)
**Version:** 6.0.0-subtraction
**Product:** Lumo Grow (lumo-ops)
**Production:** https://lumo-ops.vercel.app
**Dogfood URL:** https://lumo-learn.com
**Status:** BINDING — subtract surface area until the product is easy

This set has four parts:
1. sp.constitution
2. sp.specify
3. sp.plan
4. sp.tasks

(The pasted set was truncated mid sp.plan — the Target IA code block ends the paste and
sp.tasks never arrived. Constitution and sp.specify were complete: core promise
"sign in → paste URL → problems → posts → copy"; R1 subtraction over addition; R2 max main
surface Start + Results with at most two in-page tabs; R3 live proof is done; R4 auth before
AI work; R5 no Claims homework on the critical path; R6 honest errors; R7 copy before publish;
R8 safety without ceremony; R9 explicit freeze; R10 self-audit. SC-01..SC-07 and FR-01..FR-10
as given; NFR-01 mobile, NFR-02 no secrets in NEXT_PUBLIC_*, NFR-03 prefer deleting/hiding.
Out of scope: video, voice, leads, connector expansion, marketing site, Advanced internals,
Lumo Learn.)

## Response snapshot

Asked two clarifiers rather than guessing, since both changed the size of the diff:

1. **FR-07 literalness** → owner chose *bury nav only*: ops routes keep their current URLs
   (/knowledge, /analyze, /settings …) and stay reachable only through the footer Advanced
   link. The alternative — physically relocating ~30 route folders under /advanced/* and
   rewriting ~34 files of links, revalidatePath calls and OAuth callbacks — was rejected as
   churn that buys URL cosmetics, not simplicity. The (ops) shell is the "or equivalent".
2. **Deliverable** → implement now; the task list derived here rather than waiting for the
   missing sp.tasks.

Implemented:

- **Nav cut from five to two.** `(growth)/layout.tsx` NAV is now Start · Results. Hurdles and
  Pack are gone as destinations; Publish and Next stayed as routes (an existing user
  mid-approval must not lose them) but are no longer in the chrome and nothing on the simple
  path points at them. Advanced stays in the footer.
- **/hurdles + /pack merged into /results.** `git mv` of the pack route to results, hurdles
  deleted. One server page loads the latest analyze_run and the latest pack in parallel and
  renders two in-page panels through `results-tabs.tsx` — the constitution's ceiling of two,
  asserted in a test. Posts is the default tab whenever posts exist; Problems leads only when
  there is nothing written yet. Angles moved into a `<details>` ("Why these posts") because
  they are the reasoning, not the outcome.
- **Copy is the primary action.** `copy-post.tsx` exports `postText()` (hook, script, CTA,
  hashtags) and a `CopyPost` button rendered on every post card, including draft-only
  networks — exactly the case where copying is the only way to use the post. Clipboard
  refusal says so instead of silently looking like success.
- **Redirects, not 404s.** `/hurdles` and `/pack` were live in production long enough to be
  bookmarked, so next.config redirects both permanently to /results. Start's action, Next's
  cards, Publish's empty state and the pack actions' revalidatePath all target /results.
- **Already satisfied, left alone:** SC-06 (logged-out one-liner — 004 T-1.1), SC-07 (error
  split across extract / AI config / provider / auth — 004), FR-04/FR-05 (facts bind the
  first run, forbidden patterns in code), SC-05 (production health reports ai.configured
  true on groq, migrations applied).

Not done, and said so: Vercel env listing returned 403 for this account, so FR-09 was
verified through /api/health rather than by reading the project's variable names. The
speckit files were written in the follow-up prompt (PHR 0034).

## Outcome

- ✅ Impact: default signed-in surface is Start → Results; the copyable output is one tab of
  one screen, and three former primary destinations stopped being destinations.
- 🧪 Tests: typecheck, both guard scripts, 226 unit tests (new nav-contract suite pins
  SC-03/SC-04/FR-03/FR-06 against the source), production build. Integration suites still
  need a reachable Supabase.
- 📁 Files: 13 changed, 1 deleted, 3 added (results page, tabs, copy button) plus the test.
- 🔁 Next prompts: live SC-01..SC-04 walkthrough on production against https://lumo-learn.com;
  then decide whether Next and Publish survive the next subtraction pass at all.
- 🧠 Reflection: R10 self-audit — this removed a screen and three nav entries and added no
  setting; a tired founder now sees one field, then one screen with the posts in front.

## Evaluation notes (flywheel)

- Failure modes observed: stale `.next/types` made typecheck report the deleted routes as
  missing modules — a clean of that directory, not a code problem.
- Graders run and results (PASS/FAIL): typecheck PASS · public-env PASS · publish-guards PASS
  · unit PASS · build PASS · integration SKIPPED (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): walk the production path on a phone (NFR-01) and
  time it end to end.
