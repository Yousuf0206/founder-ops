# Production dogfood — Lumo Grow

**Milestone:** 5.1.0-recovery · **Production:** https://lumo-ops.vercel.app ·
**Dogfood URL:** https://lumo-learn.com

Constitution R1: a task is done when a human completes the step **on production**. This
is that walk-through. It is written for the owner alone — if it needs an engineer at the
keyboard, the milestone is not done.

Expect it to take about fifteen minutes end to end, most of it waiting on two AI runs.

---

## 0. Is this build configured? (30 seconds, no sign-in)

```bash
curl -s https://lumo-ops.vercel.app/api/health | python -m json.tool
```

Expect `"ok": true`, `ai.configured: true`, a model name,
`publish.linkedin: true`, and `supabase.migrations.applied: true`. The `commit` field tells
you which build answered.

`migrations` is probed, not assumed: the endpoint asks the production database for zero
rows of one column per migration and names anything absent, separating a missing table
(`missingTables`) from a missing column (`missingColumns`). Both `0016` and `0017` were
verified applied on 2026-11-15.

This proves the keys are *present*, not that they *work* — step 3 proves that. A `503`
here means stop: a variable is missing on Vercel Production (constitution R4 makes that a
P0, not an ops footnote). Set it, redeploy, re-run this.

## 1. Logged out: does the product explain itself? (SC-09)

Open https://lumo-ops.vercel.app in a private window.

You should land on the login screen and be able to say, within about ten seconds, what
this product does: paste a product URL, get the hurdles, get the posts, publish after
approving. There must be no offer of a demo without an account — analysis costs AI
credits, so sign-in comes first by decision (R3).

## 2. Sign in: where do you land? (SC-07)

Sign in. You must arrive at **Start**, not at an ops console, and not at a form asking
for approved claims before anything runs.

The nav should read exactly: Start · Hurdles · Pack · Publish · Next. Advanced lives in
the footer. Click each of the five now and confirm none of them 404s.

## 3. Start → Hurdles (SC-01, SC-02, SC-06)

Paste `https://lumo-learn.com` and submit. Leave the goal alone, or pick one; it is
optional.

Expect a ranked list of growth hurdles, normally in well under two minutes. You must not
be asked to visit Knowledge or Claims first — that is SC-02, and being asked is a
regression, not a setup step.

If it fails, the message tells you which kind of failure it was, and they mean different
things (SC-08, R5):

| What you read | What it means | What to do |
|---|---|---|
| We could not read that page / limited scan | Extract problem: the page was unreachable, robots-disallowed, or too thin | Try the home page rather than a login screen |
| No AI provider is configured | `ai_config` — this deployment is missing `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | Set them on Vercel **Production**, redeploy |
| The provider is unavailable / rejected us | `ai_provider` — the key is wrong, out of credit, or the provider is down | Check the provider dashboard and the key |
| Your session expired / viewers cannot | `auth` — sign in again, or you lack the role | Sign in; ask an owner for writer access |
| You have used N of N runs today | Daily cap, working as intended | Wait, or raise the cap in Advanced → Settings |

Anything phrased as "we could not read your page" when the real cause was a key is a bug
worth reporting — that confusion is exactly what R5 forbids.

## 4. Hurdles → Pack (SC-03, SC-04)

Press **Generate pack** on Hurdles.

Expect at least 3 angles and at least 5 posts on `/pack`, each editable in place. Edit one
post and save it; the edit must survive a page reload. Instagram posts, if any, are
draft-only until the Meta connector exists (FR-07) and will say so.

## 5. Connect → approve → publish → receipt (SC-05)

1. Go to **Publish** and connect LinkedIn. You will be sent to LinkedIn and back.
2. Approve exactly one post. Approval is yours; nothing publishes without it (R7).
3. Publish it.
4. Confirm the receipt: a permalink you can open, and the same post visible on
   **Next** under Receipts.

Then confirm the guardrails, once:

- Publishing the same approved post twice does not create a second LinkedIn post.
- The daily cap refuses the run that exceeds it, with a message saying so.

## 6. Advanced still exists (US5)

Open **Advanced** from the footer. Knowledge, Research, Strategy, Campaigns, Leads and
Audit should all still be there. They must simply never be the default home again (R2).

---

## When something fails, read the logs

Each analyze and pack attempt writes one JSON line (no URLs, no page text, no post copy):

```json
{"ts":"…","event":"growth.analyze","outcome":"error","latency_ms":1840,
 "workspace_id":"…","model":"…","status":502,"error_class":"FetchFailedError",
 "error_kind":"extract"}
```

```bash
# Vercel → the production deployment → Logs, or:
vercel logs https://lumo-ops.vercel.app
```

`error_kind` is the triage order: `ai_config` means we broke the deployment, `ai_provider`
means the key or the provider, `extract` means the page, `auth` means the caller, `cap`
and `refusal` mean the system worked as designed.

## Sign-off

The milestone is complete when steps 1–6 pass on production with the owner alone, and
SC-01–SC-09 in `specs/004-recovery/spec.md` are all green. Record the date here when it
happens — the 7-day green window for lifting the expansion freeze (R9) starts then.

- Dogfood completed on: _(unrecorded)_
