# Tasks: More Networks 6.1.0

**Spec:** `specs/006-networks/spec.md` · **Plan:** `specs/006-networks/plan.md`

Status vocabulary, as in 004 and 005 — merged code is not done:

- `[x]` **verified** — code in place *and* observed working on production.
- `[~]` **code complete** — in the repo and reasoned through, awaiting production proof.
- `[ ]` **open** — not implemented.
- `[owner]` — needs the owner at the keyboard (an app, a Page, a paid tier, a real post).

Baseline: 2026-11-15, on top of `82c71b9`. **Nothing here is verified.** Every connector is
code against a documented API and a stubbed test; not one has yet exchanged a token with
the real platform. The honest summary is that the path exists and has never been walked.

## Phase 1 — Meta OAuth (SC-01, SC-02)

- [~] **T-1.1** `lib/connectors/meta/oauth.ts`: authorization URL with the six scopes the
  connector actually uses, each justified in the file — Meta reviews them individually.
- [~] **T-1.2** Code → short-lived user token → **long-lived** user token. The second hop is
  not optional: without it the connection dies about an hour after a founder makes it, and
  every scheduled post afterwards fails for no visible reason.
- [~] **T-1.3** `fetchMetaConnection` picks the asset per platform: the Page for Facebook,
  the linked IG professional account for Instagram. Both carry the **Page** token, which is
  what Meta actually authorises.
- [~] **T-1.4** Named refusals for the two states a founder can fix: no Pages at all, and a
  Page with no Instagram professional account linked.
- [~] **T-1.5** Graph errors mapped to the connector taxonomy — code 190 and 401 to
  `token_revoked`, 4/32/429 to `rate_limited`, 5xx to `unavailable`.

## Phase 2 — Meta publishing (SC-04, SC-05)

- [~] **T-2.1** `publishToFacebookPage`: `/{page-id}/feed` for text, `/{page-id}/photos`
  when the post carries an image. The receipt uses the POST id, not the photo id.
- [~] **T-2.2** `publishToInstagram`: media container, then publish. Two calls, and only the
  second can be `outcome_unknown` — nothing is visible between them.
- [~] **T-2.3** `InstagramMediaRequiredError` refuses a caption-only post **before any API
  call**, with a sentence that names the fix.
- [~] **T-2.4** `requiresImage()` in the registry, kept separate from `hasLiveConnector()`,
  so "this platform publishes" and "this post can publish" stay different claims.
- [~] **T-2.5** `image_url` added to `contentPayloadSchema`, defaulted so every draft
  written before today still parses; editable on the post card only where it is needed.
- [~] **T-2.6** 13 unit tests (`tests/unit/meta-connector.test.ts`), including: the Page
  token is stored rather than the user token, and a caption-only IG post makes **zero**
  network calls.

## Phase 3 — X (SC-03, SC-06, SC-08)

- [~] **T-3.1** PKCE: `createPkcePair()` in `oauth-state`, verifier carried in the signed
  state cookie, only the S256 challenge sent to X. Asserted by test.
- [~] **T-3.2** Confidential-client token exchange: Basic auth **and** the verifier.
- [~] **T-3.3** `refreshXToken`, with the rotated refresh token written back before use.
- [~] **T-3.4** `freshAccessToken` in the executor refreshes X tokens inside a 5-minute
  window of expiry; LinkedIn and Meta keep the old "expired means reconnect" behaviour,
  which is true for them.
- [~] **T-3.5** `composeXPost` drops whole parts to fit 280 and never cuts a sentence: the
  text that goes out must be text a human approved.
- [~] **T-3.6** A 403 is reported as the paid-tier problem it almost always is, by name.
- [~] **T-3.7** 12 unit tests (`tests/unit/x-connector.test.ts`), including that the
  verifier never appears in the authorization URL.

## Phase 4 — Routing and UI (SC-07, SC-10)

- [~] **T-4.1** `publishVia` dispatches on platform, each connector taking a named id — a
  member, a Page, an IG account, an X user — so a row for one platform cannot publish
  through another.
- [~] **T-4.2** The Instant Publish screen matches each post to the account **for its own
  platform**. The previous "first active account" was correct only while one connector
  existed; with four it would have published an Instagram caption through LinkedIn.
- [~] **T-4.3** Connect buttons for every live platform this server has credentials for,
  on both the Instant screen and the ops connections page. Configuration is checked before
  the click, so nobody is sent on a round trip that ends in "not configured".
- [~] **T-4.4** `PACK_PLATFORMS` now writes for the four live networks, with the prompt
  asking for a spread rather than eight LinkedIn posts.
- [~] **T-4.5** No new route, no new nav entry: 6.0.0 R2 holds. The nav contract test still
  passes unchanged.

## Phase 5 — Honest absence (SC-09)

- [~] **T-5.1** TikTok and YouTube stay off `LIVE_PUBLISH_PLATFORMS`, with the reason in the
  file: both APIs publish video and this product writes words.
- [~] **T-5.2** The connections page says "copy only — these networks publish video" rather
  than "not available yet", which would imply a date.
- [~] **T-5.3** `docs/connectors.md` written for the owner: what each platform needs before
  its button works, including Meta App Review, the IG professional-account requirement, and
  the X paid tier.
- [~] **T-5.4** `/api/health` reports `publish.meta` and `publish.x` alongside
  `publish.linkedin` — presence of keys, never a claim that they work.

## Phase 6 — Production proof

Nothing above is done until these pass. All need the owner.

- [ ] **T-6.1** `[owner]` Set `META_APP_ID`, `META_APP_SECRET`, `X_CLIENT_ID`,
  `X_CLIENT_SECRET` on Vercel **Production**, and add all three redirect URLs to the apps.
- [ ] **T-6.2** `[owner]` SC-01: connect a Facebook Page; the confirmation names the Page.
- [ ] **T-6.3** `[owner]` SC-02: connect the Instagram professional account linked to it.
- [ ] **T-6.4** `[owner]` SC-03: connect X, PKCE end to end.
- [ ] **T-6.5** `[owner]` SC-04: approve and publish one Facebook post; open the permalink.
- [ ] **T-6.6** `[owner]` SC-05: approve and publish one Instagram post **with** an image
  URL, and confirm a post without one is refused before approval.
- [ ] **T-6.7** `[owner]` SC-06: approve and publish one X post; open the permalink.
- [ ] **T-6.8** `[owner]` SC-08: schedule an X post more than two hours out and confirm it
  publishes — the one behaviour no unit test can prove.
- [ ] **T-6.9** `[owner]` SC-07: with two networks connected, confirm each post went to its
  own network.

## Carried over from 005, still open

- [ ] **NFR-01** The simple path on a real phone.
- [ ] **R3** A non-engineer reaching a copied post unaided.
- [ ] **D-1 follow-up** Watch whether `UnparseablePackError` recurs now that the reader is
  lenient, and what `reason` it reports if it does.

## Self-audit (6.0.0 R10, which still binds)

1. *Did we remove or hide complexity, or add it?* Added — three connectors, deliberately,
   because the product already wrote the posts and could not send them. Held the line
   elsewhere: no new screen, no new nav entry, no settings page, and two networks left out
   rather than faked.
2. *Can a tired founder finish URL → copy on production without a guide?* Unchanged. Copy
   is still the default outcome and nothing on the simple path requires a connection.
