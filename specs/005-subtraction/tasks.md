# Tasks: Subtraction Milestone 6.0.0

**Spec:** `specs/005-subtraction/spec.md` · **Plan:** `specs/005-subtraction/plan.md`

> Reconstructed, not dictated: the owner's paste was truncated before sp.tasks. These tasks
> describe the work as delivered, in the plan's phase order.

Status vocabulary, carried over from 004 — merged code is not done:

- `[x]` **verified** — code in place *and* observed working on production.
- `[~]` **code complete** — in the repo and reasoned through, awaiting production proof.
- `[ ]` **open** — not implemented.
- `[owner]` — needs the owner at the keyboard (a real run, a real read, credentials).

Baseline: 2026-11-15, working tree on top of commit `f7f59be` ("Record the first successful
production run"), Vercel project `founder-ops`, production alias `lumo-ops.vercel.app`.
The subtraction work is **in the working tree, not yet committed or deployed**, so every
UI task below is `[~]`: the local gates are green and no production deployment has served
it. SC-05 is the exception — it was already true before this milestone and was re-checked.

**Green on production:** SC-05 (health reports `ai.configured: true`, provider `groq`,
model `openai/gpt-oss-120b`, migrations applied), and SC-06/SC-07's substance from 004.
**Awaiting deploy + a live read:** SC-01, SC-02, SC-03, SC-04.

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

- [ ] **T-6.1** `[owner]` Commit and deploy the working tree to Production.
- [ ] **T-6.2** `[owner]` SC-01: sign in on production, paste `https://lumo-learn.com` on
  Start, land on Results with hurdles, having touched neither Knowledge nor Claims.
- [ ] **T-6.3** `[owner]` SC-02: generate from that run and see ≥5 usable posts in the Posts
  tab, with no separate module to learn.
- [ ] **T-6.4** `[owner]` SC-03: copy a post and paste it somewhere real.
- [ ] **T-6.5** `[owner]` SC-04: confirm the header offers Start and Results only, and that
  Advanced is a footer link.
- [ ] **T-6.6** `[owner]` NFR-01: run T-6.2 through T-6.4 on a phone.
- [ ] **T-6.7** `[owner]` R3's real test: hand the URL to a non-engineer with no
  instructions and watch whether they reach a copied post unaided.
- [ ] **T-6.8** Confirm `/hurdles` and `/pack` redirect rather than 404 on production.

**Exit:** the milestone. Until T-6.2 through T-6.5 are green, R9 holds the freeze.

## Self-audit (constitution R10)

1. *Did we remove or hide complexity, or add it?* Removed: one screen deleted, three nav
   entries gone, one top-level section demoted to a disclosure. Added: a tab strip, a copy
   button, and a test — the tab strip exists to retire a destination, and nothing added is a
   setting.
2. *Can a tired founder finish URL → copy on production without a guide?* Locally, yes: one
   field, one screen, posts in front with a Copy button on each. On production it is
   unproven until Phase 6.
