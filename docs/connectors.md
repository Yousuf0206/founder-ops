# Connecting networks — what each platform needs

**Milestone:** 6.1.0-networks · **Production:** https://lumo-ops.vercel.app

Four networks can publish: LinkedIn, Facebook Pages, Instagram, X. Two cannot and
deliberately are not built: TikTok and YouTube.

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

`publish.linkedin`, `publish.meta`, `publish.x` report whether the keys are **set**. None of
them says the platform will accept those keys — only a real connect does.

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

## TikTok and YouTube — why they are absent

Both APIs publish **video and nothing else**. This product writes words. Connecting them
would put a Publish button on a post that could never be published, which is worse than no
button. They stay Copy-only until there is a video asset to upload; the day that exists,
they are a connector each and nothing else has to change.

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
