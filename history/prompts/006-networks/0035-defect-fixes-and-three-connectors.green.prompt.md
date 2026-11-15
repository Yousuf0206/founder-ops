---
id: 0035
title: Defect Fixes And Three Connectors
stage: green
date: 2026-11-15
surface: agent
model: claude-opus-5
feature: 006-networks
branch: main
user: yousuf0206
command: build all the left phases, then add the apis of facebook, instagram, x, youtube and tiktok
labels: ["connectors", "meta", "instagram", "x", "defects", "pack-parsing"]
links:
  spec: specs/006-networks/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - lib/growth/pack.ts
 - lib/ai/provider.ts
 - lib/ai/content.ts
 - lib/connectors/registry.ts
 - lib/connectors/oauth-state.ts
 - lib/connectors/meta/oauth.ts
 - lib/connectors/meta/publish.ts
 - lib/connectors/x/oauth.ts
 - lib/connectors/x/publish.ts
 - lib/publish/execute.ts
 - app/(growth)/layout.tsx
 - app/(growth)/results/page.tsx
 - app/(growth)/results/pack-post.tsx
 - app/(growth)/results/actions.ts
 - app/(growth)/publish/page.tsx
 - app/(ops)/settings/connections/page.tsx
 - app/api/ops/connections/[platform]/route.ts
 - app/api/ops/connections/[platform]/callback/route.ts
 - app/api/health/route.ts
 - env.example
 - docs/connectors.md
 - specs/006-networks/spec.md
 - specs/006-networks/plan.md
 - specs/006-networks/tasks.md
 - tests/unit/pack-parse.test.ts
 - tests/unit/meta-connector.test.ts
 - tests/unit/x-connector.test.ts
tests:
 - npm run typecheck (pass)
 - npm run check:public-env (pass)
 - npm run check:publish-guards (pass — 147 files clean)
 - npx vitest run tests/unit (267 passed across 21 files; 40 of them new)
 - npm run build (pass)
 - integration suites still unrun — no reachable Supabase
---

## Prompt

ok, now what I want you is that, we build all the left phases. Then, I also add the apis of
facebook, instagram, x, youtube and tiktok.

## Response snapshot

Asked two clarifiers first, because both changed the shape of the work: TikTok and YouTube
publish video and nothing else, and this product writes words. Owner chose Facebook,
Instagram and X now, TikTok/YouTube later, and confirmed they hold all four developer apps.

**005's open defects, fixed and shipped (`82c71b9`).** D-1 was the one that mattered: the
pack reader was all-or-nothing, so one malformed post, a ninth post past the maximum, or a
platform spelled "LinkedIn" discarded the whole pack and charged a cap slot — which is
exactly what failed on production and then succeeded on an identical retry.
`parsePackOutput` now reads element by element and fails only when what survives is not a
pack, and `UnparseablePackError` carries a reason (invalid_json / truncated / no_angles /
too_few_posts) plus counts, never model text. The provider reports `finish_reason`, so "ran
out of room" is distinguishable from "answered badly". D-4: trailing hashtag lines folded
into the list so a copied post stops pasting them twice. D-3: Posts leads only when the
pack belongs to the run on screen, otherwise a banner says where the posts came from. D-2:
`prefetch={false}` on the nav, since the prefetched /results payload predated the analysis.

**Three connectors (`dbea3c1`).** Meta is one login and two assets — a Page token reaches
the Page, and Instagram is reached through the Page it is linked to — with the short-lived
token exchanged for a long-lived one on the way in. Instagram's API has no caption-only
post, so `requiresImage()` separates "this platform publishes" from "this post can
publish": the card warns before approval and the connector refuses before any call. X
needed PKCE (verifier in the signed state cookie, only the hash to the platform) and, more
importantly, token refresh in the executor — its access tokens last two hours, shorter than
the gap between approving and a cron run sending. The Instant screen now matches each post
to the account for its own platform, which "first active account" would have got publicly
and unrecoverably wrong the first time someone connected two networks.

Nothing underneath moved: claim check, cap, approval, receipt and the one-executor rule are
002's, and the guard script still reports publishing reachable only through
`lib/publish/execute.ts`. No new route and no new nav entry, so 6.0.0 R2 holds.

Flagged rather than assumed: the R9 freeze lifts by its own terms now SC-01–SC-05 are
green, but the 7-day window has not elapsed and two 005 checks are still owner-side. That
is recorded at the top of specs/006-networks/spec.md as the owner's call.

## Outcome

- ✅ Impact: four publishable networks instead of one, and the first-run pack failure that
  the production walk found is gone.
- 🧪 Tests: 267 unit tests (40 new), typecheck, both guard scripts, build. No connector has
  exchanged a token with a real platform — Phase 6 of specs/006-networks/tasks.md says so.
- 📁 Files: 27 touched, 9 added.
- 🔁 Next prompts: owner sets META_* and X_* on Production and adds three redirect URLs;
  then connect each network and send one post per network (T-6.2..T-6.9).
- 🧠 Reflection: the asymmetry between platforms was the whole design. Treating "add a
  network" as a uniform task would have produced an Instagram button that fails at the
  platform and an X connection that dies two hours after it is made.

## Evaluation notes (flywheel)

- Failure modes observed: a heredoc containing JS arrow syntax broke the shell and left an
  empty `row.id` file in the repo; caught before commit and removed. Python scripts via a
  file in the scratchpad are the safer route for multi-line edits.
- Graders run and results (PASS/FAIL): typecheck PASS · public-env PASS · publish-guards
  PASS · unit PASS · build PASS · integration SKIPPED (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the first real Meta connect, check whether
  App Review blocks the scopes in development mode or only for other people's Pages.
