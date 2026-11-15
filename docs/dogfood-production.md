# Production dogfood — Lumo Grow

**Milestone:** 6.0.0-subtraction · **Production:** https://lumo-ops.vercel.app ·
**Dogfood URL:** https://lumo-learn.com

Constitution R3: a task is done when a human completes the step **on production**. This
is that walk-through. It is written for the owner alone — if it needs an engineer at the
keyboard, the milestone is not done.

**Steps 1–5 are the milestone.** They are the product promise end to end — sign in, paste a
URL, read the problems, copy a post — and should take about five minutes, most of it waiting
on two AI runs. Steps 6–8 are optional: publishing is no longer on the critical path
(R7, FR-10), so a failure there does not block 6.0.0.

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

## 1. Logged out: does the product explain itself? (SC-06)

Open https://lumo-ops.vercel.app in a private window.

You should land on the login screen and be able to say, within about ten seconds, what
this product does: paste a product URL, get the problems holding growth back, get the
posts. There must be no offer of a demo without an account — analysis costs AI credits, so
sign-in comes first by decision (R4).

## 2. Sign in: where do you land, and how much is there? (SC-04, FR-01)

Sign in. You must arrive at **Start**, not at an ops console, and not at a form asking
for approved claims before anything runs.

The nav must read exactly **Start · Results** — two entries, nothing else. Advanced is a
small link in the footer. A third entry in the header is an SC-04 failure, not a
nice-to-have: Hurdles, Pack, Publish and Next were four of the five destinations this
milestone removed, and the first two of those became this screen's two tabs.

Start itself should be one URL field, one optional goal, one button. If you are asked for
anything else before you can submit, that is the setup form this product keeps deleting.

## 3. Start → Results (SC-01, SC-05)

Paste `https://lumo-learn.com` and submit. Leave the goal alone, or pick one; it is
optional.

You land on **Results**. Nothing has been written yet, so it opens on the **Problems** tab:
a ranked list of growth hurdles, normally in well under two minutes. You must not be asked
to visit Knowledge or Claims first — that is SC-01, and being asked is a regression, not a
setup step.

If it fails, the message tells you which kind of failure it was, and they mean different
things (SC-07, R6):

| What you read | What it means | What to do |
|---|---|---|
| We could not read that page / limited scan | Extract problem: the page was unreachable, robots-disallowed, or too thin | Try the home page rather than a login screen |
| No AI provider is configured | `ai_config` — this deployment is missing `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | Set them on Vercel **Production**, redeploy |
| The provider is unavailable / rejected us | `ai_provider` — the key is wrong, out of credit, or the provider is down | Check the provider dashboard and the key |
| Your session expired / viewers cannot | `auth` — sign in again, or you lack the role | Sign in; ask an owner for writer access |
| You have used N of N runs today | Daily cap, working as intended | Wait, or raise the cap in Advanced → Settings |

Anything phrased as "we could not read your page" when the real cause was a key is a bug
worth reporting — that confusion is exactly what R6 forbids.

## 4. Problems → Posts, without leaving the screen (SC-02)

Press **Write my posts**, at the bottom of the Problems tab. It is an action on this screen,
not a destination: when it finishes you are on the same route, now on the **Posts** tab.

Expect at least 5 posts, each editable in place. Edit one and save it; the edit must survive
a reload. The angles that produced them are folded into a "Why these posts" disclosure —
open it if you want the reasoning. Posts for networks that cannot publish yet say
"Copy only" and are otherwise completely usable.

Switch between Problems and Posts a few times. There are exactly two tabs, switching is
instant, and an edit in progress survives a look at the problems.

## 5. Copy a post — this is the finish line (SC-03)

Press **Copy post** on any post, then paste it somewhere real: a LinkedIn composer, a note,
anywhere. What lands should be the post as you would send it — hook, body, call to action,
hashtags — and nothing else.

That paste is the milestone. Everything below it is optional.

If the button reports that your browser blocked the clipboard, that is honest rather than
broken; select the text and copy it by hand, and note which browser did it.

## 6. Optional — connect → approve → publish → receipt (FR-10)

1. Go to **Publish** and connect LinkedIn. You will be sent to LinkedIn and back.
2. Approve exactly one post. Approval is yours; nothing publishes without it (R8).
3. Publish it.
4. Confirm the receipt: a permalink you can open, and the same post visible on
   **Next** under Receipts.

Then confirm the guardrails, once:

- Publishing the same approved post twice does not create a second LinkedIn post.
- The daily cap refuses the run that exceeds it, with a message saying so.

Publish and Next are no longer in the nav. Reach them at `/publish` and `/next`, or from the
cards on Next. They still work; they are simply not where a first run is pointed.

## 7. Optional — Advanced still exists (US3)

Open **Advanced** from the footer. Knowledge, Research, Strategy, Campaigns, Leads and
Audit should all still be there. They must simply never be the default home again (R2). Their URLs are unchanged —
`/knowledge`, `/analyze`, `/settings` — and that is deliberate: see
`specs/005-subtraction/spec.md` § FR-07.

## 8. Optional — the old links still work

`https://lumo-ops.vercel.app/hurdles` and `/pack` should land you on Results rather than a
404. Both were primary destinations long enough to be bookmarked. (Verified by request on
2026-11-15: both answer `308 → /results`.)

## 9. The real test (R3)

Hand the URL to someone who has never seen it, say nothing beyond "this is for product
marketing", and watch. If they reach a copied post without asking you a question, the
milestone is done. If you have to explain a screen, write down the sentence you had to say
— that sentence is the next thing to subtract.

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

6.0.0 is complete when steps 1–5 and step 9 pass on production with the owner alone, and
SC-01–SC-07 in `specs/005-subtraction/spec.md` are all green. Steps 6–8 are optional and do
not gate it. Record the date here when it happens — the 7-day green window for lifting the
expansion freeze (R9) starts then.

- 5.1.0-recovery dogfood completed on: _(unrecorded)_
- 6.0.0-subtraction dogfood completed on: _(unrecorded)_

### What to report back

For each of steps 2, 3, 4 and 5: what you saw, in one line. If something failed, the exact
sentence on screen — the wording is the diagnosis. Phase 6 in
`specs/005-subtraction/tasks.md` is marked from that.
