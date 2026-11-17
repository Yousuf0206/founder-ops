# Tasks: Subtraction Milestone 6.0.0

**Spec:** `specs/005-subtraction/spec.md` · **Plan:** `specs/005-subtraction/plan.md`

> Reconstructed, not dictated: the owner's paste was truncated before sp.tasks. These tasks
> describe the work as delivered, in the plan's phase order.

Status vocabulary, carried over from 004 — merged code is not done:

- `[x]` **verified** — code in place *and* observed working on production.
- `[~]` **code complete** — in the repo and reasoned through, awaiting production proof.
- `[ ]` **open** — not implemented.
- `[owner]` — needs the owner at the keyboard (a real run, a real read, credentials).

Baseline: 2026-11-15. The subtraction work is commit `cab6276` ("Cut the signed-in app to
Start and Results"), **deployed to Production** as `dpl_5jz98jF…` on Vercel project
`founder-ops` (alias `lumo-ops.vercel.app`, `/api/health` reports `"commit":"cab6276…"`).

The UI tasks stay `[~]` deliberately. Deployed is not verified: constitution R3 defines done
as a *non-engineer completing the path*, and nobody has yet looked at the header, read a
hurdle or pasted a copied post. What is verified is everything a request can prove from
outside — the routing, the redirects and the configuration.

**Green on production:** SC-01, SC-02, SC-03 and SC-04 — walked in a signed-in browser on
2026-11-15 (Phase 6) — plus SC-05 (health reports `ai.configured: true`, provider `groq`,
model `openai/gpt-oss-120b`, migrations applied), SC-06/SC-07's substance from 004, FR-01
(`/` → 307 → `/login?next=/start`), and the legacy redirects.
**Still open:** NFR-01 on a real phone, R3's non-engineer test, and four defects the walk
turned up (D-1 to D-4 below) — one of which, the flaky pack, a first-time founder could
meet before they ever see a post.

## Phase 0 — Audit what recovery already satisfies

- [x] **T-0.1** SC-05 re-verified against production, not inferred:
  `GET https://lumo-ops.vercel.app/api/health` → `"ai":{"configured":true,"provider":"groq","model":"openai/gpt-oss-120b"}`,
  `"migrations":{"applied":true}`, commit `f7f59be`. No code change needed.
- [x] **T-0.2** SC-06 already satisfied by 004 T-1.1 — `app/(auth)/login/page.tsx` leads with
  one sentence ("Paste your product URL. Get the growth hurdles holding it back, and the
  posts that answer them."), three bullets, and no no-signup-demo claim. Left untouched.
- [x] **T-0.3** SC-07 already satisfied by 004 T-3.1 — `lib/http/run-errors.ts` plus the
  `messageFor()` maps in the Start and pack actions separate extract, AI config, AI
  provider, cap and auth failures. Constitution R6 needed no new code.
- [x] **T-0.4** FR-01 already satisfied by 004 T-2.1 — `app/page.tsx` routes an
  authenticated `/` to `/start` and a signed-out one through `/login?next=/start`.
- [x] **T-0.5** FR-04 and FR-05 already satisfied — `lib/prompts/assemble.ts` binds a first
  run on `product_facts` with no approved-claims gate, and `lib/growth/analyze.ts`
  (`findForbiddenClaims`, `dropForbiddenHurdles`) plus the pack's forbidden check keep the
  floor in code, not in the UI.
- [x] **T-0.6** FR-02 already satisfied — Start is one required URL field, an optional goal,
  and one primary button (`app/(growth)/start/`). No change made; a second required field
  would have been the setup form 003 deleted.
- [x] **T-0.7** FR-09's user-facing half already satisfied — `ProviderNotConfiguredError`
  and the config-vs-outage split in `lib/ai/provider.ts` (`providerFailureMessage`) say
  "AI is not configured correctly on our side… not a problem with your page."
  **Not done:** listing the Production variable *names* — the Vercel API returned
  `403 forbidden` for this account (`GET /v10/projects/{id}/env`). Presence was established
  through `/api/health` instead, which is the stronger signal anyway since it is the running
  deployment answering. `[owner]` if a name-by-name audit is ever wanted.

**Exit:** nothing already working is rebuilt. ✅

## Phase 1 — Merge Hurdles + Pack into Results (FR-03)

- [~] **T-1.1** `app/(growth)/pack/` moved to `app/(growth)/results/` with `git mv`, so the
  actions, the post card and the generate control keep their history.
- [~] **T-1.2** `app/(growth)/hurdles/page.tsx` deleted. Its hurdle list, its three status
  cards (running / failed / read-but-empty) and its "analyse a different URL" escape hatch
  moved into the Problems panel.
- [~] **T-1.3** `app/(growth)/results/page.tsx` written: one server component loading the
  latest `analyze_runs` row and the latest `growth_packs` row in parallel, then that pack's
  `content_drafts`. jsonb is re-validated on read (`hurdleSchema`, `packAngleSchema`) rather
  than trusted, as both predecessors did.
- [~] **T-1.4** `app/(growth)/results/results-tabs.tsx`: a client component holding the tab
  state and receiving both server-rendered panels as children. Exactly two tabs — the
  constitution's ceiling — with `role="tablist"`/`tab`/`tabpanel` wiring.
- [~] **T-1.5** Default tab is Posts whenever posts exist, Problems otherwise. A run that
  failed or read nothing therefore always opens on the panel that explains it.
- [~] **T-1.6** Angles demoted from a top-level section to a "Why these posts" `<details>`
  disclosure. They are the reasoning behind the output, not the output.
- [~] **T-1.7** Generating stays an **action**, never a destination: `GeneratePack` renders
  inside both panels — primary in Problems when nothing is written, and as "Write a new set
  of posts" once something is.
- [~] **T-1.8** No schema or backend change. `lib/growth/analyze.ts` and `lib/growth/pack.ts`
  were not touched, so every publish guardrail still applies to pack posts.

**Exit:** FR-03. One route holds problems and posts.

## Phase 2 — Copy as the primary action (SC-03, FR-06, R7)

- [~] **T-2.1** `app/(growth)/results/copy-post.tsx`: `postText()` assembles the post as it
  would be pasted — hook, body, CTA, hashtags, blank-line separated, empty parts dropped.
- [~] **T-2.2** `CopyPost` button rendered in the read view of every post card
  (`results/pack-post.tsx`), **not** behind the publishable check: a draft-only network is
  precisely where copying is the only way to use the post.
- [~] **T-2.3** Clipboard refusal (insecure context, denied permission) reports itself and
  tells the user to select the text, instead of looking like success. Confirmation is
  announced through an `aria-live` region, not only coloured in.
- [~] **T-2.4** The draft-only badge rewritten from "copy it out by hand until Instagram
  publishing is live" to "Copy only — publishing to this network isn't live yet", since
  copying is now a button rather than a chore.
- [~] **T-2.5** Publish left reachable and entirely optional (FR-10): no card, button or
  next-step on the simple path requires it.

**Exit:** SC-03, FR-06 — pending a live click.

## Phase 3 — Cut the nav to two (SC-04, FR-07)

- [~] **T-3.1** `app/(growth)/layout.tsx` `NAV` reduced from five entries to
  `Start · Results`. The nav contract comment rewritten to say what the two are and why the
  other three stopped being destinations.
- [~] **T-3.2** `/publish` and `/next` keep working as routes but leave the chrome. Nothing
  on the simple path points at them; a user mid-approval loses nothing.
- [~] **T-3.3** Advanced stays a footer link and is never co-equal. Asserted by test.
- [x] **T-3.4** FR-07 interpretation ratified by the owner: *bury nav only*. The ops console
  keeps its URLs and qualifies as "or equivalent" — own shell, rooted at `/advanced`,
  reachable from the footer alone. Rationale and the rejected alternative are in
  `spec.md` § "FR-07, as interpreted and ratified".
- [x] **T-3.5** FR-08 confirmed clear by 004 T-2.4: no banner or help string claims nothing
  works without approved claims. Re-read, nothing to rewrite.

**Exit:** SC-04 — pending a live look at the header.

## Phase 4 — Redirects and link sweep

- [~] **T-4.1** `next.config.ts` redirects `/hurdles` → `/results` and `/pack` → `/results`,
  permanently. Both were primary destinations long enough to be bookmarked.
- [~] **T-4.2** `app/(growth)/start/actions.ts` revalidates and redirects to `/results`.
- [~] **T-4.3** `app/(growth)/results/actions.ts` revalidates and redirects to `/results`
  (both the generate and the per-post save paths).
- [~] **T-4.4** `app/(growth)/publish/actions.ts` revalidates `/results`.
- [~] **T-4.5** `app/(growth)/next/page.tsx` cards repointed: "Write more posts" and
  "Re-read your results" both go to `/results`.
- [~] **T-4.6** `app/(growth)/publish/page.tsx` empty state links "Write some posts" to
  `/results`.
- [~] **T-4.7** No `"/hurdles"` or `"/pack"` href, redirect target or `revalidatePath`
  remains anywhere in `app/` — verified by grep and by the Phase 5 test.

**Exit:** no dead ends, no stale pointers.

## Phase 5 — Pin the contract (the anti-regrowth guard)

- [~] **T-5.1** `tests/unit/nav-contract.test.ts` (8 tests) asserts, against the source:
  `NAV` is exactly `["/start", "/results"]`; `/advanced` is absent from `NAV` and present in
  the footer; Results reads both `analyze_runs` and `growth_packs`; the tab ids are exactly
  `["problems", "posts"]`; `app/(growth)/hurdles` and `app/(growth)/pack` no longer exist;
  both redirects are configured; Start redirects to `/results`; `CopyPost` sits in the read
  view of a post card; `postText` uses all four post parts; clipboard failure has a
  `role="alert"`.
- [~] **T-5.2** Local gates green: `npm run typecheck`, `npm run check:public-env`
  (NFR-02 — no secret carries a `NEXT_PUBLIC_` prefix), `npm run check:publish-guards`
  (143 files clean), `npx vitest run tests/unit` (226 passed across 18 files),
  `npm run build` (`/results` in the route table; `/hurdles` and `/pack` absent).
- [ ] **T-5.3** Integration suites unrun: all 8 files fail at setup with
  `AuthRetryableFetchError: fetch failed` and 120 tests skip, because no Supabase is
  reachable from this machine. Pre-existing and unrelated to this milestone — the same
  state 004 recorded.

**Exit:** the nav cannot regrow silently.

## Phase 6 — Production proof (constitution R3)

Nothing in this milestone is *done* until a non-engineer finishes the path on production.

- [x] **T-6.1** Committed as `cab6276` and deployed to Production; `/api/health` returns
  that commit, `ai.configured: true` and `migrations.applied: true`. The signed-out probe
  also confirms the gate still holds: `/`, `/start` and `/results` each answer
  `307 → /login?next=/start`, so no AI work is reachable unauthenticated (R4).
Driven in the owner's signed-in Chrome on 2026-11-15, ~19:20–19:35 local, against the
production deployment of `cab6276`.

- [x] **T-6.2** SC-01: pasted `https://lumo-learn.com` on Start, landed on `/results` in
  about ten seconds with four hurdles — no clear pricing numbers, limited social proof, a
  crowded value proposition, a call to action not reinforced down the page. Knowledge and
  Claims were never opened, and nothing asked for them.
- [x] **T-6.3** SC-02: six posts in the Posts tab, each with its angle, hook, body, CTA and
  hashtags, editable in place, in the same session and with no module to learn. The first
  attempt at generating them **failed** — see D-1 — and the retry succeeded.
- [x] **T-6.4** SC-03: pressed Copy post and pasted the result back into a text field. 611
  characters arrived, opening with the post's own hook, so the clipboard carries the real
  post rather than a label or a URL.
- [x] **T-6.5** SC-04: the header reads `Start · Results`, nothing else, with Advanced a
  small link in the footer. Both tabs switch instantly and the angles sit behind a
  "Why these posts (4 angles)" disclosure.
- [ ] **T-6.6** `[owner]` NFR-01: unverified. Two attempts to resize the browser window to
  phone widths (390×844, then 412×900) reported success while `window.innerWidth` stayed
  1358, so the viewport never narrowed and nothing about mobile was actually observed. This
  needs a real phone, not a resized desktop window.
- [ ] **T-6.7** `[owner]` R3's real test: hand the URL to a non-engineer with no
  instructions and watch whether they reach a copied post unaided.
- [x] **T-6.8** Both legacy paths redirect on production rather than 404:
  `/hurdles` → `308` → `https://lumo-ops.vercel.app/results`, and `/pack` likewise.

**Exit:** the milestone. SC-01 through SC-04 are now green on production, so what remains is
T-6.6 (a phone) and T-6.7 (someone who has never seen it). R9 holds until those land, and
the defects below are triaged.

## Defects found during the walk

None of these were introduced by the merge; the walk is simply the first time anyone looked.

**Status (2026-11-18):** all four are fixed in code by `82c71b9` and deployed — production
`/api/health` reports `6c6a6ee` (origin/main), which contains it. `[~]` = fixed and
unit-tested, not yet re-observed on production; each becomes `[x]` only when a re-walk of
steps 3–5 in `docs/dogfood-production.md` shows it gone (R3).

- `[~]` D-1: `parsePackOutput` reads element by element — bad posts dropped, surplus
  trimmed, platform casing forgiven; fails only below the five-post floor. Failures log a
  reason (`truncated`, `invalid_json`, …) and the provider's `finish_reason`.
  `tests/unit/pack-parse.test.ts`.
- `[~]` D-2: the shell's nav links use `prefetch={false}`, so `/results` is never cached
  before the run it should show exists (`app/(growth)/layout.tsx`).
- `[~]` D-3: Posts leads only when `pack.analyze_run_id === run.id`; otherwise Problems
  leads and the Posts tab says its posts came from an earlier analysis
  (`app/(growth)/results/page.tsx`).
- `[~]` D-4: a trailing hashtag-only body line is folded into `hashtags` before saving
  (`lib/growth/pack.ts`). Drafts written before the fix keep the duplicate.

Original reports:

- [ ] **D-1 — pack generation is flaky on production.** The first "Write a new set of posts"
  returned *"The pack came back unreadable. The failed run was logged — try again."*
  (`UnparseablePackError`): the model's JSON did not parse. The identical retry, seconds
  later, produced six posts. One failure in two attempts is not a flake a founder should
  meet on their first run — the pack prompt asks for far more output than the analysis does,
  so truncation against the provider's token ceiling is the first thing to check, before a
  retry is added. The message itself behaved correctly (SC-07): it blamed the run, not the
  page, and said it had been logged.
- [ ] **D-2 — Results may render the previous run's hurdles immediately after an analysis.**
  Right after the redirect, the Problems tab showed hurdles titled "Social proof is thin and
  vague" and "Pricing information is missing concrete numbers". Minutes later, and on every
  reload since, the same workspace shows four differently-titled hurdles. Both are plausible
  readings of the same page, so one of those two renders did not come from the run the header
  named. The screen is supposed to show the newest run for the workspace; it appears not to
  have, once, at exactly the moment a founder is looking hardest.
- [ ] **D-3 — a fresh analysis lands on a stale Posts tab.** Results defaults to Posts
  whenever *any* pack exists, so the run above opened on six posts from an earlier pack —
  one of them marked `published` — under a header naming the URL just analysed. Harmless
  here because the URL was the same product; actively misleading if someone analyses a
  different URL and is shown another product's posts as the result. The default should
  consider whether the latest pack belongs to the latest run.
- [ ] **D-4 — hashtags are duplicated in generated posts.** Several posts carry their
  hashtag line inside the body *and* again in the hashtags field, so a copied post pastes
  them twice. A prompt or assembly fix, not a UI one — but it lands in the copied text,
  which is the product's output.

## Self-audit (constitution R10)

1. *Did we remove or hide complexity, or add it?* Removed: one screen deleted, three nav
   entries gone, one top-level section demoted to a disclosure. Added: a tab strip, a copy
   button, and a test — the tab strip exists to retire a destination, and nothing added is a
   setting.
2. *Can a tired founder finish URL → copy on production without a guide?* On production,
   yes — the walk did it in about four minutes, one field, one screen, Copy on each post.
   With one caveat worth keeping in view: it took two presses to get posts (D-1), and a
   founder who met that failure on their first run would have no reason to press again.
