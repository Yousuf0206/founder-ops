# The production proof walk — six networks, one sitting

**Covers:** 006 Phase 6 (`specs/006-networks/tasks.md`) and 007 Phase 7
(`specs/007-video-networks/tasks.md`) · **Production:** https://lumo-ops.vercel.app

Everything in both milestones is code against a documented API and a stubbed test. **Not
one connector has exchanged a token with a real platform.** That is what this walk is for,
and it needs you at the keyboard: an app, an account, a real post. Nothing here can be
automated, because the thing being proved is that the platforms behave as their
documentation says.

Work top to bottom. Each step says what you should see, and what it means when you see
something else. Tick the boxes as you go; the SC ids are the success criteria in the two
specs, so a ticked box is a milestone claim you can defend.

---

## Before you start — the two things that are not optional

Both of these are setup, not code, and each one silently breaks a *later* step if skipped.

- [ ] **TikTok: verify the domain your media lives on.** TikTok developer portal → your app
      → URL prefix / domain verification. Add the host your image and video URLs will come
      from (for example a Supabase storage bucket's domain, or your own CDN). Without this,
      every TikTok post fails with `url_ownership_unverified` — and it will look like a bug
      in step 7.
- [ ] **YouTube: add yourself as a test user.** Google Cloud → APIs & Services → OAuth
      consent screen → Test users. Until the consent screen is verified, nobody else can
      connect, and an unlisted account gets a Google error that does not mention this.

While you are in the portals, confirm every redirect URL. One per platform, exactly:

```
https://lumo-ops.vercel.app/api/ops/connections/linkedin/callback
https://lumo-ops.vercel.app/api/ops/connections/facebook/callback
https://lumo-ops.vercel.app/api/ops/connections/instagram/callback
https://lumo-ops.vercel.app/api/ops/connections/x/callback
https://lumo-ops.vercel.app/api/ops/connections/tiktok/callback
https://lumo-ops.vercel.app/api/ops/connections/youtube/callback
```

A mismatch here is the single most common failure of the whole walk, and the platforms all
report it differently. Google says `redirect_uri_mismatch`; TikTok and Meta are vaguer.

---

## 1. Set the keys on Production (T-6.1, T-7.1)

On Vercel → Project → Settings → Environment Variables, **Production** scope:

| Variable | From |
|---|---|
| `CONNECTOR_TOKEN_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `META_APP_ID`, `META_APP_SECRET` | Meta app → Settings → Basic |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X developer portal → your app → Keys and tokens → OAuth 2.0 |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok developer portal → your app (a client **key**) |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Google Cloud → Credentials → OAuth 2.0 Client ID (Web application) |

Redeploy — environment variables do not apply to an existing build — then:

- [ ] **Check what the deployment believes it has.**

```bash
curl -s https://lumo-ops.vercel.app/api/health | python -m json.tool
```

Every key under `publish` should be `true`, and `supabase.migrations.applied` must be
`true`. These say the keys are **set**, never that a platform accepts them. If `ok` is
`false`, read `migrations` before anything else: an unapplied migration breaks the loop just
as surely as a missing key.

---

## 2. Connect the five logins (SC 006-01…03, 007-01…02)

Sign in as the workspace owner and go to **Settings → Connected accounts**. Each row says
what it needs before you click. Connect them in this order — it puts the two that need the
most setup last, so an early failure is cheap:

- [ ] **LinkedIn.** Confirmation names you. *(already proved in 002, worth re-checking)*
- [ ] **Facebook** — T-6.2 / SC-01. The confirmation must name **the Page**, not you. If it
      names you, the app is reading the user token instead of the Page token.
- [ ] **Instagram** — T-6.3 / SC-02. The same Facebook login, a different asset. Refusals
      here are specific on purpose: "no Pages at all" and "no Instagram professional account
      linked to that Page" are both named, and both are fixed in Meta Business settings, not
      here.
- [ ] **X** — T-6.4 / SC-03. PKCE end to end. A failure that mentions a verifier means the
      state cookie did not survive the round trip.
- [ ] **TikTok** — T-7.2 / SC-01. The confirmation names the account. Note the page says
      posts stay private until the audit passes; that is expected, not a fault.
- [ ] **YouTube** — T-7.3 / SC-02. The confirmation must name **the channel**. If you are
      told the Google account has no channel, it genuinely has none — create one on YouTube
      and connect again.

Each connection should appear in the Accounts list with its platform and an expiry where
the platform gives one. **No token is ever shown**; if you can see one, stop and report it.

---

## 3. Make a pack to publish from

- [ ] **Run the loop.** Start → paste a product URL → Results. The pack now writes for all
      six networks, so you should see LinkedIn, Facebook, Instagram, X, TikTok and YouTube
      posts in one pack (SC-12).
- [ ] **Check the badges before touching anything.** The Instagram post should say it needs
      an image, the YouTube post that it needs a video, the TikTok post that it needs either.
      That is SC 007-05 and 007-07 proved on screen — *before* approval, which is the whole
      point of the check.

Now give three posts their media. Edit each card on Results and paste a public URL:

- [ ] an image on the Instagram post
- [ ] a video on the YouTube post (**128 MB or smaller**, and the URL must report a size)
- [ ] a video **or** an image on the TikTok post — from the domain you verified in step 0

The badge should disappear as soon as you save. If it does not, the URL did not save: check
you pressed Save on that card rather than navigating away.

---

## 4. Send one post per network

Go to **Publish**. Each post offers a button only when its own platform is connected and its
media requirement is met. Approve, then publish, one at a time — and open the permalink each
time before moving on.

- [ ] **Facebook** — T-6.5 / SC-04. Permalink opens the post on the Page.
- [ ] **Instagram** — T-6.6 / SC-05. Publishes with the image. Then confirm the *refusal*:
      an Instagram post with no image must offer no Publish button and say why.
- [ ] **X** — T-6.7 / SC-06. Permalink opens the post. A 403 here naming a paid tier is the
      connector working correctly: posting needs a paid X API tier.
- [ ] **TikTok** — T-7.4 / SC-03 or SC-04. Expect one of two outcomes, both correct:
      a receipt with a link, or a receipt with a platform id and no link because TikTok was
      still processing. **Open the TikTok app and confirm the post exists.** Pre-audit it
      will be private — visible to you, nobody else.
- [ ] **YouTube** — T-7.5 / SC-06. The upload takes as long as the video takes to stream.
      The permalink is a `watch?v=` URL; open it.
- [ ] **Both networks, their own accounts** — T-6.9 / SC 007-08. With several connected,
      confirm each post landed on its own network. This is the one mistake that is public
      and unrecoverable, so check it rather than assume it.

---

## 5. The two things only time can prove

- [ ] **A scheduled post survives a dead token** — T-6.8 / SC 007-09. In **Advanced →
      Publish**, schedule an X post, a TikTok post and a YouTube post **more than two hours
      out**, then come back after the cron run (08:00 UTC, `vercel.json`) or trigger the
      runner by hand. All three platforms' access tokens expire within two hours, so this
      proves the refresh path — the one behaviour no unit test can prove, because the test
      would have to wait.
- [ ] **A rotated refresh token was stored.** After that scheduled run, publish again to X
      and to TikTok. Both rotate their refresh token on every use, so a second success means
      the new one was written back. A failure saying "reconnect the account" means it was
      not, and the server log will carry the words *Could not store the refreshed … token*.

---

## 6. Carried over from 005, still open

These are not about connectors and are still unticked:

- [ ] **NFR-01** — walk the simple path on a real phone.
- [ ] **R3** — a non-engineer reaching a copied post unaided, with no guidance from you.
- [ ] **D-1 follow-up** — watch whether `UnparseablePackError` recurs now the pack reader is
      lenient, and what `reason` it reports if it does.

---

## When something fails

The job's error names one kind from `lib/connectors/errors.ts`. Read it literally:

| Kind | Means | What to do |
|---|---|---|
| `token_revoked` | the platform rejected the credential | reconnect; the row is marked expired automatically |
| `rate_limited` | nothing was posted | wait, then retry — retry is safe |
| `rejected` | the platform refused this content or request | read the message; it names the fix |
| `outcome_unknown` | the request may have landed | **check the account before retrying** |
| `unavailable` | the platform failed before accepting anything | retry |
| `misconfigured` | our side: a missing key or version | fix the env var, redeploy |

The three refusals you are most likely to meet on this walk, and what each really means:

- *"TikTok will only fetch media from a domain you have verified"* — step 0, first box.
- *"Posting requires a paid X API tier"* — true, and not fixable here.
- *"YouTube has no way to publish text"* — the post has no `video_url`. Add one on Results.

And the one to take seriously: **`outcome_unknown` never means failed.** It means a request
may have reached the platform before the connection broke. Check the account before you
retry, or you will post twice in public.

---

## What a finished walk entitles you to say

With every box above ticked: six networks connect, six publish, each post goes to its own
network, scheduled posts survive their tokens, and a post that cannot be published says so
before it is approved. Until then — and this is the standard both milestones set for
themselves — these connectors are **code, not capability**.
