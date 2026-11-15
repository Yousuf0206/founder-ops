# Implementation Plan: More Networks 6.1.0

**Spec:** `specs/006-networks/spec.md` · **Tasks:** `specs/006-networks/tasks.md`
**Owner setup guide:** `docs/connectors.md`

## Strategy

**Extend, don't re-architect.** 002 built the publish path properly: a claim check and cap
reservation in the database, one executor, sealed tokens, a receipt, an error taxonomy. A
new network should therefore be two files and a registry entry — an OAuth module and a
publish module — and nothing else should have to change. Where something else *did* have
to change, that is noted below as a finding, because it means the seam was in the wrong
place.

## What each platform actually is

This is the part that decides the design, and it is not symmetric.

| | Login | Publishes | Token life | Blocker |
|---|---|---|---|---|
| LinkedIn | OIDC | text | 60 days | none |
| Facebook Page | Facebook Login | text, or text + photo | 60-day user token; Page token derived | App Review for `pages_manage_posts` |
| Instagram | **the same** Facebook Login | **image + caption only** | as above | professional account linked to a Page; no caption-only post exists |
| X | OAuth2 + PKCE | one post ≤280 | **~2 hours** | posting needs a paid tier |
| TikTok | — | **video only** | — | nothing to upload |
| YouTube | — | **video only** | — | nothing to upload |

Three consequences, each of which shaped the code:

1. **Instagram and Facebook are one login, two assets.** There is no Instagram-only
   sign-in. A person logs in with Facebook; a Page token reaches the Page, and the IG
   professional account is reached *through* the Page. So `platform` selects which asset to
   keep, not which flow to run, and both rows store a Page token. Revoking the Page revokes
   both, which is correct: that is what Meta does.
2. **Instagram cannot publish a caption alone.** No endpoint exists for it. Being able to
   publish to Instagram and being able to publish *this post* to Instagram are therefore
   different facts, which is why `requiresImage()` is separate from `hasLiveConnector()`.
   The UI asks before offering a button; the connector enforces regardless.
3. **X tokens die between approval and sending.** Two hours is shorter than the gap between
   approving a post and a cron run sending it, so without a refresh, scheduled posting to X
   would fail essentially always — and would tell the founder to reconnect a healthy
   account. Refresh belongs in the executor, before the call.

## Phases

| Phase | Name | Maps to | Outcome |
|-------|------|---------|---------|
| 1 | Meta OAuth | SC-01, SC-02, FR-01, FR-02 | Facebook and Instagram connect |
| 2 | Meta publishing | SC-04, SC-05, FR-06 | Page posts and IG posts, media rule enforced |
| 3 | X, end to end | SC-03, SC-06, SC-08, FR-03, FR-04 | PKCE connect, post, refresh |
| 4 | Routing and UI | SC-07, SC-10, FR-05 | Right account per post, no new screen |
| 5 | Honest absence | SC-09 | TikTok and YouTube stated, not implied |
| 6 | Production proof | all | Owner connects and sends one of each |

## Decisions worth recording

| Decision | Why | Alternative rejected |
|---|---|---|
| Instagram ships with a media requirement rather than not shipping | The caption, the angle and the hashtags are already the product's output; refusing to connect would not make them more useful | Leaving IG Copy-only, which keeps a real publish path unbuilt for a solvable reason |
| `image_url` on the payload, filled by a human | `visual_plan` describes a picture in words; this is the made picture. Generating images is frozen | Generating an image per post, which R9 forbids and nobody asked for |
| X posts are single, never threads | A thread is several writes where the cap reserved one, one receipt for many posts, and a half-sent thread on failure | A loop inside the publish function, which breaks three guarantees quietly |
| Refresh in the executor, not a cron | It is needed exactly when publishing, and the rotated token must be stored before use | A background refresher, which adds a moving part and still races the publish |
| Per-platform account matching | Publishing an Instagram caption through LinkedIn is public and unrecoverable | Keeping "first active account", which was correct only while one connector existed |
| TikTok and YouTube left out | Their APIs publish video; we write words | Connecting them for appearances, putting a button on a post that can never be sent |

## Risks

| Risk | Mitigation |
|---|---|
| Meta App Review not granted | Development mode works with the owner's own Page; the gap is documented in `docs/connectors.md` |
| X free tier silently blocks posting | The 403 is translated into "posting requires a paid X API tier" rather than a generic refusal |
| An IG post approved without an image | The badge appears before approval, and the connector refuses before any API call |
| A rotated X refresh token is lost | Written back before the publish; a failed write is logged loudly, and the publish still proceeds |
| A duplicate public post after a lost connection | `outcome_unknown`, never a retryable failure — unchanged from 002 and tested per connector |

## Definition of milestone done

SC-01 through SC-09 pass on production with real accounts, and SC-10 holds: still two
destinations. Until then these connectors are code, not capability.
