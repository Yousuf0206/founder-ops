# Feature Specification: The Video Networks

**Milestone:** 7.0.0-video-networks
**Status:** BINDING (owner-directed 2026-11-16)
**Production:** https://lumo-ops.vercel.app
**Predecessor:** `specs/006-networks/spec.md` (6.1.0-networks)

## Where this sits against 006

006 shipped four connectors and left two out, with this reason in the registry: *both APIs
publish video and nothing else, and this product writes words.* That reason was true and is
still true. What changed on 2026-11-16 is that the owner holds developer apps for all five
platforms and directed that TikTok and YouTube be finished — which means supplying the one
thing the reason named as missing: **a video**.

So this milestone does not overturn 006's finding. It removes the premise behind it. A
founder who has a video (or, on TikTok, an image) can now publish; a founder who has
neither is in exactly the position 006 described, and is told so in the same words.

The subtraction constitution (6.0.0) still binds. R2 in particular — Start and Results are
the only primary destinations — so this milestone adds **no new screen and no new nav
entry**, as 006 did not.

## What the two platforms actually allow

Verified against the platforms' own reference pages on 2026-11-16, not from memory:

| | Words alone? | An image? | A video? |
|---|---|---|---|
| TikTok | no | **yes** — photo post, `media_type: PHOTO`, up to 35 images | yes — `PULL_FROM_URL` |
| YouTube | **no, and there is no endpoint for it** | no | yes — `videos.insert`, real bytes |

The YouTube Data API v3 resource list contains no community-post resource and no method
that creates a text or image channel post. `commentThreads.insert` posts a comment and
`channelBanners.insert` uploads a banner; neither is a post. That is why YouTube's only
publish path here is a video upload, and why `video_url` exists.

## Problem statement

Lumo writes for six networks. Two of them — the two whose own norms in
`lib/content/platforms.ts` describe a *script* — were absent from publishing and absent
from the pack, so the product never produced the thing those networks take even though it
already knew what that thing should say. Meanwhile `image_url` had established the pattern:
a human supplies the made media, the product supplies the words and the publish.

## Goal

Finish the set. Publish to TikTok and YouTube when the founder has supplied the media those
platforms require, and refuse clearly — before approval — when they have not.

## User scenarios

- **US1 — Connect TikTok (must).** An owner connects a TikTok account the same way they
  connect the others: one click, a platform round trip, a confirmation naming the account.
- **US2 — Connect YouTube (must).** An owner connects a YouTube channel, and the
  confirmation names the channel.
- **US3 — A video is a field, not a feature (must).** A founder pastes a public video URL
  on the post that needs one, exactly as they paste an image URL today.
- **US4 — Refused before approval (must).** A YouTube post with no video, or a TikTok post
  with neither image nor video, says so on the card *before* the founder approves it, and
  Copy still works.
- **US5 — Private until audited (must).** A founder publishing to TikTok from an unaudited
  app is told, before they connect, that TikTok keeps those posts private until the app
  passes review — not afterwards, by a post nobody can see.
- **US6 — Scheduled posting survives short-lived tokens (must).** TikTok access tokens last
  two hours and YouTube's one hour; a post approved now and sent by cron later still
  publishes.

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-01 | An owner can connect a TikTok account and see the account name confirmed. |
| SC-02 | An owner can connect a YouTube channel and see the channel name confirmed. |
| SC-03 | A TikTok post with an image URL publishes, and the receipt carries a platform id. |
| SC-04 | A TikTok post with a video URL publishes as a video, not as a photo. |
| SC-05 | A TikTok post with neither image nor video is refused before approval, with a sentence naming the fix. |
| SC-06 | A YouTube post with a video URL publishes and returns a working watch permalink. |
| SC-07 | A YouTube post without a video URL is refused before any API call, with the true reason: the API has no endpoint for a text post. |
| SC-08 | A post is only ever published through an account of its own platform (006 SC-07, now across six). |
| SC-09 | A TikTok or YouTube post scheduled beyond the access-token lifetime still publishes, via refresh. |
| SC-10 | `url_ownership_unverified` from TikTok is reported as the domain-verification problem it is, by name. |
| SC-11 | Default nav is still Start and Results; no screen was added. |
| SC-12 | A pack writes for all six networks, and the video networks' posts carry the script their norms ask for. |

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | `video_url` is part of the content payload, defaulted so every draft written before today still parses. |
| FR-02 | The registry carries a per-platform **media requirement** (`none`, `image`, `video`, `image_or_video`), and every route and screen reads it rather than naming platforms. |
| FR-03 | TikTok uses OAuth 2.0 with `client_key`; no PKCE, because TikTok's web flow does not use it and the signed state cookie is the protection. |
| FR-04 | TikTok and YouTube access tokens are refreshed before publishing when near expiry; TikTok's rotated refresh token is stored before use. |
| FR-05 | TikTok publishes a video when the post has one and a photo otherwise — one platform, two endpoints, chosen by the payload. |
| FR-06 | TikTok's `privacy_level` is read from `creator_info/query` and never guessed; a value the creator cannot use is never sent. |
| FR-07 | YouTube uploads by streaming the video from its URL into a resumable session; the bytes never touch the filesystem. |
| FR-08 | A video larger than the documented cap is refused before the session is opened, with the size and the cap. |
| FR-09 | Each connector maps its failures onto the existing `ConnectorError` taxonomy; no new kind is added. |
| FR-10 | A connector is reachable only through `lib/publish/execute.ts`, enforced by `scripts/check-publish-guards.mjs`. |
| FR-11 | `/api/health` reports credential presence for all five connector families. |
| FR-12 | A publish whose outcome the platform never confirmed is `outcome_unknown`, never a clean failure. |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | No secret in `NEXT_PUBLIC_*`; tokens stay sealed at rest and never reach the browser. |
| NFR-02 | No new primary destination, per 6.0.0 R2. |
| NFR-03 | A YouTube upload must fit inside the publish function's time budget, or be refused rather than started. |

## Out of scope

Video or image *generation* (still frozen, 006 R9); TikTok carousels of more than one
image; TikTok's MEDIA_UPLOAD inbox mode; YouTube Shorts-specific metadata, playlists,
thumbnails and captions; YouTube community posts (no endpoint exists); waiting for a TikTok
publish to finish beyond the bounded wait in plan.md; metrics for either platform.

## Assumptions

- The owner holds a TikTok developer app with Content Posting API access and a Google Cloud
  project with the YouTube Data API enabled (stated 2026-11-16).
- TikTok's audit and Google's OAuth verification are the owner's to complete. Unaudited
  TikTok posts are private; an unverified Google app works for its own test users. Both
  gaps are documented rather than coded around.
- The founder's media URLs are publicly reachable. For TikTok they must additionally sit on
  a domain verified in the TikTok developer portal, which is an owner setup step rather
  than a code problem.
