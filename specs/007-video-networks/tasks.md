# Tasks: The Video Networks 7.0.0

**Spec:** `specs/007-video-networks/spec.md` · **Plan:** `specs/007-video-networks/plan.md`
**Owner walk:** `docs/production-proof.md`

Status vocabulary, as in 004, 005 and 006 — merged code is not done:

- `[x]` **verified** — code in place *and* observed working on production.
- `[~]` **code complete** — in the repo and reasoned through, awaiting production proof.
- `[ ]` **open** — not implemented.
- `[owner]` — needs the owner at the keyboard (an app, an account, a video, a real post).

Baseline: 2026-11-16, on top of `8115b98`. **Nothing here is verified.** Both connectors are
code against a documented API and a stubbed test; neither has exchanged a token with the
real platform. The API contracts were read from TikTok's and Google's own reference pages on
2026-11-16 rather than recalled, which is the most this can claim before Phase 7.

## Phase 1 — The payload and the registry (FR-01, FR-02)

- [~] **T-1.1** `video_url` added to `contentPayloadSchema`, defaulted so every draft written
  before today still parses — the same bargain `image_url` made in 006.
- [~] **T-1.2** `PLATFORM_MEDIA` in the registry: a per-platform `MediaRequirement` of
  `none | image | video | image_or_video`. This replaces 006's boolean, which could not
  express "either" and would have become two booleans that disagree.
- [~] **T-1.3** `requiresImage()` keeps its exact 006 meaning, so existing callers and tests
  still say what they said; `requiresVideo`, `acceptsImage`, `acceptsVideo`, `requiresMedia`
  and `hasRequiredMedia` are added beside it.
- [~] **T-1.4** `mediaRequirementReason()` — one sentence per requirement, written once, so
  the card and the connector's refusal say the same words rather than two near-misses.
- [~] **T-1.5** `lib/connectors/configured.ts`: one `platformConfigured()`. By 007 this
  switch existed in three places; a sixth platform would have guaranteed they disagreed, and
  the disagreement surfaces as a founder clicking Connect and landing on "not configured".

## Phase 2 — TikTok OAuth (SC-01, FR-03, FR-04)

- [~] **T-2.1** `tikTokAuthorizationUrl` with `client_key` — TikTok's name for it; sending
  `client_id` fails unhelpfully. Scopes `user.info.basic` and `video.publish`, each
  justified in the file.
- [~] **T-2.2** No PKCE, deliberately: TikTok applies PKCE to desktop and mobile and has the
  web flow rely on the client secret plus a state token, which is what the signed state
  cookie already is. Asserted by test, so a future reader does not "fix" it.
- [~] **T-2.3** `exchangeTikTokCode` keeps `open_id` as the publishing identity, and refuses
  a token that arrives without one rather than storing an account with nowhere to post.
- [~] **T-2.4** `refreshTikTokToken`, with the rotated refresh token returned for the caller
  to store before use. TikTok invalidates the old one immediately.
- [~] **T-2.5** Comma-separated scopes parsed as such. A space-splitter reads TikTok's
  answer as one scope and stores a wrong row.
- [~] **T-2.6** `fetchTikTokIdentity` degrades to the account id when the name call fails:
  a connection that works but is unnamed is still a working connection.

## Phase 3 — TikTok publishing (SC-03, SC-04, SC-10, FR-05, FR-06)

- [~] **T-3.1** `publishToTikTok` dispatches on the payload: `/video/init/` when the post has
  a video, `/content/init/` with `media_type: PHOTO` when it has only an image. A post with
  both publishes the video.
- [~] **T-3.2** `TikTokMediaRequiredError` refuses a post with neither **before any API
  call**, with a sentence that names the fix.
- [~] **T-3.3** `fetchTikTokCreatorInfo` reads `privacy_level_options` and takes the most
  public level the creator actually allows. Guessing is a documented 403 that reads as a
  platform fault.
- [~] **T-3.4** TikTok's `error.code` read even on HTTP 200 — it answers 200 with failure
  codes, and a connector trusting the status would record a failed post as published.
- [~] **T-3.5** `mapTikTokError` covers the documented codes, with `url_ownership_unverified`
  translated into the domain-verification step by name (SC-10) and
  `unaudited_client_can_only_post_to_private_accounts` into the audit.
- [~] **T-3.6** `awaitPublish`: a bounded status poll. A completed public post gets a real
  permalink; a completed private one and a still-processing one get the publish id and no
  link, recorded as published because TikTok accepted it; `FAILED` is mapped by its
  `fail_reason`.
- [~] **T-3.7** 26 unit tests (`tests/unit/tiktok-connector.test.ts`), including: a post
  with no media makes **zero** network calls, a post with both media goes to the video
  endpoint, and the privacy level sent is the creator's own.

## Phase 4 — YouTube OAuth (SC-02, FR-04)

- [~] **T-4.1** `youTubeAuthorizationUrl` with `access_type=offline` **and**
  `prompt=consent`. Google issues a refresh token only for an offline grant and only on the
  first authorization, so without both a reconnect yields an hour-long connection and every
  later scheduled upload fails. Asserted by test.
- [~] **T-4.2** Two scopes: `youtube.upload` publishes, `youtube.readonly` names the
  channel. `youtube.upload` is not documented as sufficient for `channels.list`, so this
  asks rather than hopes.
- [~] **T-4.3** `exchangeYouTubeCode` refuses a grant with no refresh token, rather than
  storing a connection that dies within the hour for no visible reason.
- [~] **T-4.4** `refreshYouTubeToken` returns null when Google sends no new refresh token —
  it does not rotate — and the executor keeps the stored one rather than writing null over
  a working credential.
- [~] **T-4.5** `fetchYouTubeChannel` is strict where TikTok's identity call is forgiving:
  the channel id *is* the publish target, and a Google account with no channel authorizes
  fine and has nowhere to publish.

## Phase 5 — YouTube publishing (SC-06, SC-07, FR-07, FR-08)

- [~] **T-5.1** `YouTubeVideoRequiredError` refuses a post with no video **before any API
  call**, saying the API has no endpoint for a text post — a fact about YouTube, not a
  limitation of this product.
- [~] **T-5.2** `probeVideo`: a HEAD for the size, because the resumable session needs it up
  front; a URL that will not report one is refused as such.
- [~] **T-5.3** `YOUTUBE_MAX_VIDEO_BYTES` of 128 MB, enforced **before** the session opens,
  with the size and the cap in the message (NFR-03). The cap is ours — the upload streams
  through a 60-second function — and the file says so.
- [~] **T-5.4** The resumable upload: session from the `Location` header, then the video's
  own response body `PUT` through with `duplex: "half"`, so nothing is buffered in memory or
  written to a filesystem this runtime does not promise.
- [~] **T-5.5** `composeYouTubeTitle` uses a title the pack already wrote, then the hook,
  then a sentence that fits 100 characters — and refuses rather than truncating, because a
  cut title is not text a human approved.
- [~] **T-5.6** Error reasons mapped: `quotaExceeded` to the project's 100-uploads-a-day
  quota, `uploadLimitExceeded` to the channel's, `youtubeSignupRequired` to a missing
  channel, the `invalid*` family to wording the founder can edit.
- [~] **T-5.7** The two outcomes that must not be confused: a connection lost during the
  `PUT` is `outcome_unknown` (the video may exist), a 308 is `unavailable` (no video
  resource was created, so a retry is safe). Both asserted by test.
- [~] **T-5.8** `selfDeclaredMadeForKids` deliberately unset — a legal declaration about the
  audience belongs to the person publishing — with the reason in the file.
- [~] **T-5.9** 23 unit tests (`tests/unit/youtube-connector.test.ts`).

## Phase 6 — Routing, UI and the pack (SC-08, SC-11, SC-12)

- [~] **T-6.1** `publishVia` gains two cases, each taking a named id — an `openId`, a
  `channelId` — so a row stored for one platform cannot publish through another.
- [~] **T-6.2** `TOKEN_REFRESHERS` replaces the X-only branch in `freshAccessToken`: X,
  TikTok and YouTube refresh; LinkedIn and Meta keep "expired means reconnect", which is
  true for them. A platform absent from the map keeps the old behaviour.
- [~] **T-6.3** The receipt's permalink is nullable, because TikTok publishes
  asynchronously. `finish_publish_job` already accepted a null permalink, so no migration.
- [~] **T-6.4** Connect buttons and configuration checks read
  `lib/connectors/configured.ts`, so the Instant screen, the ops page and the connect route
  cannot disagree about what this deployment holds.
- [~] **T-6.5** The Results card shows a Video URL field on the platforms that take one and
  an Image URL field on the platforms that take one, from the registry rather than by naming
  platforms in JSX.
- [~] **T-6.6** The Instant Publish screen offers no Approve and no Publish button on a post
  missing its platform's media, and prints the reason. The connectors enforce it regardless:
  the screen is the courtesy, the connector is the guarantee.
- [~] **T-6.7** `PACK_PLATFORMS` is all six, and `MAX_PACK_POSTS` rises 8 → 12 with the
  platform count — six networks and eight posts means two networks get nothing, and which
  two would be the model's whim. The prompt asks for at least one post per platform.
- [~] **T-6.8** `/api/health` reports `publish.tiktok` and `publish.youtube` (FR-11) —
  presence of keys, never a claim that they work.
- [~] **T-6.9** No new route, no new nav entry: 6.0.0 R2 holds. The nav contract test passes
  unchanged.
- [~] **T-6.10** The four tests that asserted 006's exclusions now assert 007's rule, with
  the reason for the change written in each. Two of them had used TikTok as the example of a
  platform the product refuses, which is no longer what it is.

## Phase 7 — Production proof

Nothing above is done until these pass. All need the owner;
`docs/production-proof.md` is the step-by-step walk.

- [ ] **T-7.1** `[owner]` Set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
  `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` on Vercel **Production**, add both redirect
  URLs, verify the media domain in the TikTok app, and add yourself as a Google test user.
- [ ] **T-7.2** `[owner]` SC-01: connect a TikTok account; the confirmation names it.
- [ ] **T-7.3** `[owner]` SC-02: connect a YouTube channel; the confirmation names it.
- [ ] **T-7.4** `[owner]` SC-03/SC-04: publish one TikTok post with an image and one with a
  video; confirm each exists in the TikTok app (private, pre-audit).
- [ ] **T-7.5** `[owner]` SC-06: publish one YouTube video; open the watch permalink.
- [ ] **T-7.6** `[owner]` SC-05/SC-07: confirm on screen that a TikTok post with no media
  and a YouTube post with no video are refused **before** approval.
- [ ] **T-7.7** `[owner]` SC-09: schedule a TikTok and a YouTube post more than two hours
  out and confirm both publish — the refresh path, which no unit test can prove.
- [ ] **T-7.8** `[owner]` SC-10: confirm an unverified media domain reports the
  verification step by name.
- [ ] **T-7.9** `[owner]` SC-08: with several networks connected, confirm each post went to
  its own network.
- [ ] **T-7.10** `[owner]` SC-12: run a pack and confirm all six networks appear.

## Carried over, still open

- [ ] **006 Phase 6 entirely** — T-6.1 through T-6.9 of `specs/006-networks/tasks.md`.
  Folded into `docs/production-proof.md` so both milestones are proved in one sitting.
- [ ] **NFR-01 (005)** The simple path on a real phone.
- [ ] **R3 (005)** A non-engineer reaching a copied post unaided.
- [ ] **D-1 follow-up (005)** Whether `UnparseablePackError` recurs now the reader is
  lenient, and what `reason` it reports if it does.

## Self-audit (6.0.0 R10, which still binds)

1. *Did we remove or hide complexity, or add it?* Added — two connectors and a media field,
   deliberately, because the product wrote scripts for two networks it could not post to.
   Removed some too: three copies of the configuration switch became one, and a boolean that
   could only ever describe Instagram became an enum that describes all six. Held the line
   elsewhere: no new screen, no new nav entry, no media manager, no video generation, and
   the media fields sit on the card a founder is already editing.
2. *Can a tired founder finish URL → copy on production without a guide?* Unchanged. Copy is
   still the default outcome, nothing on the simple path requires a connection, and the two
   new networks add two fields that appear only on the posts that can use them.
3. *Did we claim anything we have not proved?* No. Every task above is `[~]`, the specs say
   so in their first paragraph, and the one sentence that would have been a lie — "TikTok and
   YouTube publish video and nothing else, so they stay copy-only" — was replaced rather
   than quietly deleted.
