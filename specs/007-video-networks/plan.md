# Implementation Plan: The Video Networks 7.0.0

**Spec:** `specs/007-video-networks/spec.md` · **Tasks:** `specs/007-video-networks/tasks.md`
**Owner setup guide:** `docs/connectors.md` · **Owner proof walk:** `docs/production-proof.md`

## Strategy

**Two files per platform, and one honest change to the seam.** 006 claimed a new network
should be an OAuth module plus a publish module and nothing else. That held for X, and it
holds here too — except for one thing 006 could not have known it was missing: a *media
requirement* that is not binary. `requiresImage()` was a boolean because Instagram was the
only platform with a rule. TikTok takes an image **or** a video, and YouTube takes only a
video, so the boolean becomes an enum. That is the one seam this milestone moves, and it is
moved once, in the registry, rather than by each caller asking about platforms by name.

## What each platform actually is

Verified from the platforms' reference pages on 2026-11-16.

| | Login | Publishes | Access token | Refresh | Blocker |
|---|---|---|---|---|---|
| TikTok | OAuth 2.0, `client_key`, no PKCE on web | photo post (≤35 images) or video, both `PULL_FROM_URL` | **~2 hours** | 180 days, **rotates** | audit (posts private until passed) + verified media domain |
| YouTube | Google OAuth 2.0, `access_type=offline` | video bytes via resumable upload | **~1 hour** | long-lived, does not rotate | 100 uploads/day quota; OAuth verification for non-test users |

Five consequences, each of which shaped the code:

1. **TikTok is two endpoints behind one platform.** `/v2/post/publish/content/init/` with
   `media_type: PHOTO` for images, `/v2/post/publish/video/init/` for video. Which one runs
   is decided by the payload, not by configuration, and a post with both takes the video —
   because a video is the thing TikTok is for, and the image is then a cover a human did
   not ask us to use.

2. **TikTok will not tell you a post is live.** Both endpoints answer with a `publish_id`
   and then fetch the media themselves, asynchronously. So the receipt cannot be a
   permalink the way Facebook's is. The connector waits a bounded number of short intervals
   on `/v2/post/publish/status/fetch/`, and:
   - `PUBLISH_COMPLETE` with a public post id → a real permalink;
   - `PUBLISH_COMPLETE` with none (private, because the app is unaudited) → the publish id
     as the receipt and no permalink;
   - still processing when the wait runs out → the publish id as the receipt and no
     permalink. The job is `published` because TikTok accepted it, which is the only thing
     we actually know;
   - `FAILED` → mapped by `fail_reason`, because a pull failure is a URL problem the founder
     can fix and a spam-risk refusal is not.

   The wait is bounded rather than absent because a founder reading a receipt with no link
   cannot tell "accepted" from "lost", and bounded rather than complete because this runs
   inside a publish function with a time budget.

3. **`privacy_level` cannot be guessed.** It is required for a direct post and must be one
   of the values `creator_info/query` returns for that creator. So the connector asks
   first, then picks the most public value the creator actually allows, in a stated order.
   Sending `PUBLIC_TO_EVERYONE` to a private account is a documented 403
   (`privacy_level_option_mismatch`) and would read to a founder as "TikTok is broken".

4. **YouTube needs the bytes, so the bytes stream through us.** There is no
   `PULL_FROM_URL`. The connector opens a resumable session with the video's size in
   `X-Upload-Content-Length`, then `PUT`s the video's own response body straight into the
   session URI (`duplex: "half"`), so nothing is buffered in memory or written to disk. The
   size comes from a `HEAD` on the URL: a URL that will not say how big it is cannot be
   uploaded this way, and is refused as such.

5. **A publish function has a time budget, so the cap is a product decision.** The cron
   route runs for at most 60 seconds. A video that cannot plausibly stream through in that
   window must be refused before the session opens rather than killed halfway, so the
   connector caps uploads at 128 MB and says the number out loud. This is why NFR-03 exists.

## Decisions worth recording

| Decision | Why | Alternative rejected |
|---|---|---|
| `video_url` on the payload, filled by a human | The exact precedent `image_url` set in 006: the product writes the words, a person supplies the made media. It is the smallest change that makes two platforms publishable | Generating video, which R9 freezes and nobody asked for; or leaving both networks Copy-only, which keeps a real path unbuilt for a solvable reason |
| Media requirement as an enum in the registry | TikTok takes image *or* video, so the boolean could not express it. One enum read by every caller keeps "can this platform publish" and "can this post publish" apart, which was 006's whole point | A second boolean `requiresVideo()`, which makes four platform-named conditions in the UI and silently disagrees with itself the first time a platform takes either |
| TikTok takes the video when a post has both | A video is what TikTok is; silently turning a video post into a photo post would publish something the founder did not approve | Publishing both, which is two posts against a cap that reserved one |
| A bounded status wait on TikTok, not a complete one | A receipt with no link and no reason is indistinguishable from a lost post; a complete wait does not fit a publish function | Fire and forget (no permalink, ever) or a polling cron (a moving part, for a link) |
| `privacy_level` read from `creator_info/query` | It is required, constrained per creator, and a wrong value is a 403 that reads as a platform fault | Hardcoding `PUBLIC_TO_EVERYONE`, which breaks for private accounts, or `SELF_ONLY`, which hides every post even after the audit passes |
| Streaming YouTube uploads with `duplex: "half"` | A serverless function has no disk worth using and not much memory; the stream never materialises the file | Buffering the video in memory (fails on anything real) or a temp file (needs a filesystem this runtime does not promise) |
| A stated 128 MB cap | NFR-03. A refusal naming the size and the cap is actionable; a function timeout mid-upload is not | No cap, which turns a large video into an `outcome_unknown` and a founder wondering whether it went out |
| Still no new screen | 6.0.0 R2. The media fields sit on the post card that already exists, where a founder is already editing the post | A media manager, which is a sixth destination for two text inputs |

## Phases

| Phase | Name | Maps to | Outcome |
|-------|------|---------|---------|
| 1 | The payload and the registry | FR-01, FR-02, SC-05, SC-07 | `video_url` exists; the media rule is an enum every caller reads |
| 2 | TikTok OAuth | SC-01, FR-03, FR-04 | A TikTok account connects and refreshes |
| 3 | TikTok publishing | SC-03, SC-04, SC-10, FR-05, FR-06 | Photo and video posts, privacy read not guessed, failures named |
| 4 | YouTube OAuth | SC-02, FR-04 | A channel connects and refreshes |
| 5 | YouTube publishing | SC-06, SC-07, FR-07, FR-08 | A video uploads by stream and returns a watch link |
| 6 | Routing, UI and the pack | SC-08, SC-11, SC-12 | Right account per post, media fields on the card, six-network packs |
| 7 | Production proof | all | The owner connects and sends one of each |

## Risks

| Risk | Mitigation |
|---|---|
| TikTok audit not passed, so every post is private | Said on the connections page *before* connecting, and in `docs/connectors.md`; the 403 is mapped to those words |
| Media URL not on a TikTok-verified domain | `url_ownership_unverified` is translated into the domain-verification step by name, which is the only fix |
| A YouTube upload times out mid-`PUT` | Refused above 128 MB before the session opens; a lost connection during the `PUT` is `outcome_unknown`, never a clean failure |
| Google refresh token never issued | `access_type=offline` and `prompt=consent` on every authorization, so a reconnect always re-issues one |
| YouTube's 100-uploads-per-day project quota | A quota refusal is reported as a project quota, not as a rejected video |
| TikTok's rotated refresh token lost | Written back before the publish, as X's is; a failed write is logged loudly and the publish proceeds |
| A six-network pack of eight posts is thin | The pack's maximum rises with the platform count so each network gets a post, and the two video networks get the script their norms already described |

## Definition of milestone done

SC-01 through SC-10 pass on production with real accounts, and SC-11 holds: still two
destinations. Until then these connectors are code, not capability — the same standard 006
set and the reason its Phase 6 is still open.
