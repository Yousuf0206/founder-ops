---
id: 0036
title: Build remaining phases and five network APIs
stage: green
date: 2026-11-16
surface: agent
model: claude-opus-5
feature: 007-video-networks
branch: main
user: Yousuf0206
command: (direct prompt)
labels: ["connectors", "tiktok", "youtube", "publishing", "oauth", "registry"]
links:
  spec: specs/007-video-networks/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/007-video-networks/spec.md (new)
  - specs/007-video-networks/plan.md (new)
  - specs/007-video-networks/tasks.md (new)
  - lib/connectors/tiktok/oauth.ts (new)
  - lib/connectors/tiktok/publish.ts (new)
  - lib/connectors/youtube/oauth.ts (new)
  - lib/connectors/youtube/publish.ts (new)
  - lib/connectors/configured.ts (new)
  - lib/connectors/registry.ts (media requirement enum, six live platforms)
  - lib/ai/content.ts (video_url on the payload)
  - lib/publish/execute.ts (dispatch, TOKEN_REFRESHERS, nullable permalink)
  - lib/growth/pack.ts (six platforms, max 12 posts)
  - app/api/ops/connections/[platform]/route.ts
  - app/api/ops/connections/[platform]/callback/route.ts
  - app/api/health/route.ts
  - app/(ops)/settings/connections/page.tsx
  - app/(growth)/publish/page.tsx
  - app/(growth)/publish/publish-post.tsx
  - app/(growth)/results/page.tsx
  - app/(growth)/results/pack-post.tsx
  - app/(growth)/results/actions.ts
  - env.example
  - docs/connectors.md
  - docs/production-proof.md (new)
tests:
  - tests/unit/tiktok-connector.test.ts (new, 28 tests)
  - tests/unit/youtube-connector.test.ts (new, 23 tests)
  - tests/unit/growth-pack.test.ts (006 exclusions rewritten as 007 rules)
  - tests/unit/pack-parse.test.ts (six-platform packs, new cap)
  - tests/unit/linkedin-connector.test.ts, meta-connector.test.ts, x-connector.test.ts (video_url on fixtures)
  - npm run check:public-env — PASS
  - npm run check:publish-guards — PASS (152 files)
  - npx tsc --noEmit — PASS
  - npx vitest run tests/unit — PASS (321 tests, 23 files)
  - npm run build — PASS (exit 0)
  - tests/integration — 8 files FAIL: no local Supabase on 127.0.0.1:54321 (environmental, pre-existing)
---

## Prompt

ok, now what I want you is that, we build all the left phases. Then, I also add the apis of facebook, instagram, x, youtube and tiktok.

## Response snapshot

Corrected the premise first: 006's Phases 1–5 were already code-complete, and its Phase 6
is production proof that only the owner can perform. So "the left phases" that could be
*built* were the two networks 006 deliberately left out — which is what adding the TikTok
and YouTube APIs makes possible.

Verified both platforms' contracts from their own reference pages rather than from memory,
which changed the design:

- **TikTok can publish what this product writes.** The Content Posting API takes a photo
  post (`media_type: PHOTO`, `source: PULL_FROM_URL`, `photo_images`), so an image plus a
  caption works like Instagram's. It needs `video.publish`, a developer-verified media
  domain, and — until the app passes TikTok's audit — every post it makes is private.
- **YouTube cannot publish words at all.** The Data API v3 resource list has no
  community-post resource and no method that creates a text or image post. Its only publish
  path is `videos.insert` with real bytes.

Owner chose: add `video_url` and publish for real on both; ship TikTok direct posting with
the audit caveat stated; and write the owner's production-proof walk-through.

Built as 7.0.0-video-networks, in seven phases:

1. `video_url` on the payload (defaulted, like `image_url`), and 006's `requiresImage`
   boolean replaced by a `MediaRequirement` enum in the registry — the one seam that had to
   move, because TikTok takes an image *or* a video and a boolean cannot say that.
2–3. TikTok: OAuth with `client_key` and no PKCE (its web flow does not use it), rotating
   refresh, then publishing that dispatches on the payload — video endpoint when there is a
   video, photo endpoint when there is only an image, video when both. `privacy_level` read
   from `creator_info/query` rather than guessed, `error.code` read even on HTTP 200, and a
   bounded status wait for the permalink.
4–5. YouTube: Google OAuth with `access_type=offline` *and* `prompt=consent` (without both,
   a reconnect yields an hour-long connection and every scheduled upload later fails), then
   a resumable upload that streams the video's own response body through with
   `duplex: "half"` — capped at 128 MB and refused *before* the session opens, because the
   upload passes through a 60-second function.
6. Wiring: two `publishVia` cases, a `TOKEN_REFRESHERS` map replacing the X-only refresh
   branch, a nullable receipt permalink (TikTok publishes asynchronously), media fields on
   the Results card driven by the registry, no Approve or Publish button on a post missing
   its platform's media, six-platform packs with the maximum raised 8 → 12, and
   `/api/health` reporting all five connector families. No new screen, no new nav entry.
7. Open: production proof, which needs the owner. `docs/production-proof.md` is the walk,
   covering 006's Phase 6 in the same sitting.

One correctness fix found while reviewing: a failing TikTok *status* check would have marked
an already-accepted post as failed, and a retry of that job would have posted twice in
public. The status wait now returns "published, no permalink" on any status-call failure,
with two tests for it.

Four existing tests asserted 006's exclusions ("holds back the video-only networks", TikTok
as the example of a refused platform). They were rewritten to assert 007's rule with the
reason for the change recorded in each, rather than deleted.

## Outcome

- ✅ Impact: all six networks now have a publish connector; the two that need media refuse a
  post that lacks it before approval, with the platform's own reason stated.
- 🧪 Tests: 321 unit tests pass (51 new), typecheck clean, both guard scripts clean,
  production build clean. Integration tests need a local Supabase and did not run.
- 📁 Files: 9 new, 14 modified, across specs, connectors, executor, UI, docs and env.
- 🔁 Next prompts: walk `docs/production-proof.md` on production; then `/sp.adr` for the
  media-requirement enum if it is worth recording as a decision.
- 🧠 Reflection: the honest finding is that 006's reason for excluding these networks was
  correct and had simply stopped applying. Saying that in the spec — rather than silently
  deleting the sentence — is what keeps the record trustworthy.

## Evaluation notes (flywheel)

- Failure modes observed: an early heredoc write failed on shell quoting, so file writes
  moved to the file tools; four pre-existing tests failed because they asserted the
  behaviour this milestone changes, which was correct of them and was resolved by rewriting
  the assertions with their reasons.
- Graders run and results (PASS/FAIL): check:public-env PASS, check:publish-guards PASS,
  tsc PASS, vitest unit PASS, next build PASS, vitest integration NOT RUN (no local DB).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): confirm the YouTube stream completes inside the
  60-second cron budget at a real 100 MB, and lower `YOUTUBE_MAX_VIDEO_BYTES` if it does not.
