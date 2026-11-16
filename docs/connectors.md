# Connecting networks — what each platform needs

**Milestone:** 7.0.0-video-networks · **Production:** https://lumo-ops.vercel.app

All six networks can publish: LinkedIn, Facebook Pages, Instagram, X, TikTok and YouTube.

Three of them cannot publish words on their own, and that is the platforms' rule rather
than this product's: **Instagram** needs an image, **YouTube** needs a video, **TikTok**
needs either. A post missing what its platform requires is refused on screen before you
approve it, with the sentence that says what to add — and Copy still works for every post,
on every network, with nothing connected at all.

Every connector follows the same path — an owner clicks Connect, the platform asks them to
approve, tokens are sealed with AES-256-GCM before they touch the database, and nothing
publishes without a human approval. What differs per platform is what you must set up
*before* the button works.

---

## 0. One thing for all of them

Set `CONNECTOR_TOKEN_KEY` (32 random bytes, base64) on Production, or every connect attempt
fails at the sealing step:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Check what this deployment believes it has:

```bash
curl -s https://lumo-ops.vercel.app/api/health | python -m json.tool
```

`publish.linkedin`, `publish.meta`, `publish.x`, `publish.tiktok` and `publish.youtube`
report whether the keys are **set**. None of them says the platform will accept those keys —
only a real connect does. Two in particular can be set, valid, and still not publish what
you expect: X needs a paid tier, and TikTok keeps an unaudited app's posts private.

---

## LinkedIn (live since 002)

- App with **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
- Redirect URL: `<site>/api/ops/connections/linkedin/callback`
- Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_API_VERSION` (an *active*
  version, `YYYYMM` — LinkedIn retires them, and a retired one fails every post).
- Posts as the member who connects. Page posting would need `w_organization_social` and
  Community Management access, and is not built.

## Facebook Pages (006)

- One Meta app serves Facebook **and** Instagram. Add the **Facebook Login** product.
- Redirect URL: `<site>/api/ops/connections/facebook/callback`
- Env: `META_APP_ID`, `META_APP_SECRET`
- Scopes requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
  `instagram_basic`, `instagram_content_publish`, `business_management`.
- **App Review is the long pole.** In development mode the scopes work only for people with
  a role on the app, which is enough to test with your own Page. Publishing on behalf of
  anyone else needs Review plus Business Verification.
- The person connecting must manage at least one Page. The first Page is connected; its
  name appears in the confirmation so they can see which one.
- A post with an image URL becomes a photo post; without one, a text post. Both carry the
  approved words unchanged.

## Instagram (006)

Everything above, plus:

- The Instagram account must be **professional** (Business or Creator) and **linked to the
  Facebook Page** in Meta Business settings. Personal accounts cannot publish through any
  API, and the connector says so by name rather than failing vaguely.
- Redirect URL: `<site>/api/ops/connections/instagram/callback`
- **Every Instagram post needs an image.** There is no caption-only post in the Content
  Publishing API — not a limitation of this app. Posts for Instagram show a "Needs an image
  to publish" badge and an Image URL field; the URL must be public, because Meta fetches it
  from their own servers. Without one, Copy still works and the caption is complete.

## X (006)

- OAuth 2.0 **confidential client with PKCE**, in the X developer portal.
- Redirect URL: `<site>/api/ops/connections/x/callback`
- Env: `X_CLIENT_ID`, `X_CLIENT_SECRET`
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`. The last one is what
  buys a refresh token — without it the connection dies after about two hours and every
  scheduled post afterwards fails.
- **Posting requires a paid tier.** The free tier authenticates perfectly and then refuses
  `POST /2/tweets` with a 403. The connector reports that in those words rather than as a
  generic refusal, because it is otherwise a day of debugging.
- One post per publish, never a thread: a thread would be several writes where the cap
  reserved one, and a half-sent thread when the second call fails.

## TikTok (007)

- A TikTok developer app with **Login Kit** and the **Content Posting API** product added.
- Redirect URL: `<site>/api/ops/connections/tiktok/callback`
- Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` — note TikTok calls it a client *key*.
- Scopes: `user.info.basic`, `video.publish`. `video.publish` is the one that posts; it
  covers photo posts as well as video.
- **Verify the domain your media is on.** TikTok downloads the video or image itself, and
  only from a domain or URL prefix verified in your app's settings. An unverified host fails
  with `url_ownership_unverified`, which the connector reports as exactly that step.
- **Until the app passes TikTok's audit, every post it makes is private.** The post is real
  and the publish succeeded; nobody but the account holder can see it. There is no way
  around this from the code, which is why it is said on the connections page before anyone
  connects.
- A post with a video URL publishes as a video. A post with only an image publishes as a
  photo post. A post with both publishes the video.
- TikTok publishes **asynchronously**: it answers with a publish id and fetches your media
  afterwards. The connector waits a few seconds to see the post go live and give you a link;
  if TikTok is still working, the receipt holds the publish id and no link, and the post
  appears on its own. That is recorded as published, because TikTok accepted it.
- Access tokens last about two hours and the refresh token **rotates on every use**, so the
  connector stores the new one before each publish.

## YouTube (007)

- A Google Cloud project with the **YouTube Data API v3** enabled, and an **OAuth 2.0 Web
  application** client.
- Redirect URI: `<site>/api/ops/connections/youtube/callback`
- Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- Scopes: `youtube.upload` (publishes) and `youtube.readonly` (reads the channel name for
  the confirmation).
- **YouTube has no API for a text post.** The Data API has no community-post endpoint at
  all — `commentThreads` writes a comment and `channelBanners` uploads a banner, and neither
  is a post. So a YouTube post here is a **video upload**, and a post without a video URL is
  refused before any API call with that reason stated.
- The video URL must be public, must report a `content-length`, and must be **128 MB or
  smaller**. That cap is ours, not YouTube's: the upload streams through a serverless
  function that stops after 60 seconds, and a refusal naming the size is worth more than a
  timeout halfway through. Raising it means raising `maxDuration` on
  `app/api/ops/cron/publish-due/route.ts` first.
- The pack's YouTube title is used as the video title (YouTube allows 100 characters), the
  approved body becomes the description, and hashtags become tags.
- **Quota:** 100 uploads per day per project, and each upload costs one. A quota refusal is
  reported as a project quota rather than as a rejected video.
- Until the OAuth consent screen is **verified**, only the test users listed on the app can
  connect. Google's access token lasts an hour, so the connector always asks for offline
  access and forces the consent screen, which is what guarantees a refresh token.
- The video's privacy is `public` and its category is *People & Blogs*. Nothing in a growth
  pack describes a category, so that is a stated default rather than a guess dressed up as
  data. `selfDeclaredMadeForKids` is deliberately not set: it is a legal declaration about
  the audience that belongs to you, so YouTube applies the channel's own setting.

---

## When a publish fails

Every connector maps its failures onto one taxonomy
(`lib/connectors/errors.ts`), and the job's error says which:

| Kind | Means | What to do |
|---|---|---|
| `token_revoked` | the platform rejected the credential | reconnect the account; the row is marked expired automatically |
| `rate_limited` | nothing was posted | wait; retry is safe |
| `rejected` | the platform refused this content or request | read the message — over-length, missing image, wrong tier |
| `outcome_unknown` | the request may have landed | **check the account before retrying** |
| `unavailable` | the platform failed before accepting | retry |
| `misconfigured` | our side: a missing key or version | fix the env var, redeploy |

`outcome_unknown` is the one that matters: it exists so that a lost connection never turns
into a duplicate public post.
