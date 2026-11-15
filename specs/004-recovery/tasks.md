# Tasks: Recovery Milestone 5.1.0

**Spec:** `specs/004-recovery/spec.md` · **Plan:** `specs/004-recovery/plan.md`

Status vocabulary, per constitution R1 — merged code is not done:

- `[x]` **verified** — code in place *and* observed working on production.
- `[~]` **code complete** — in the repo and reasoned through, awaiting production proof.
- `[ ]` **open** — not implemented.
- `[owner]` — needs the owner at the keyboard (credentials, OAuth consent, a real run).

Audit baseline: 2026-11-15, against commit `24515c3` and Vercel project `founder-ops`
(production alias `lumo-ops.vercel.app`).

## Phase 0 — Production baseline

- [x] **T-0.1** Required env vars inventoried from `env.example` (Supabase, AI, connectors,
  cron, email, plans).
- [x] **T-0.2** All required vars present on **Vercel Production**: `AI_PROVIDER`,
  `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, the three `NEXT_PUBLIC_SUPABASE_*`/service-role
  values, `CONNECTOR_TOKEN_KEY`, `LINKEDIN_CLIENT_ID`/`_SECRET`/`_API_VERSION`,
  `CRON_SECRET`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`.
  Presence verified; **validity** is T-0.4.
- [x] **T-0.3** Production redeployed after the connector secrets landed (latest Production
  deployment is newer than the secrets).
- [ ] **T-0.4** `[owner]` Verify one successful AI completion **against production** —
  sign in and run Start on `https://lumo-learn.com`. This is the only check that proves the
  key, not just its presence.
- [~] **T-0.5** Missing/invalid AI config returns a clear user-facing error, distinct from a
  provider outage — `lib/ai/run.ts` `ProviderNotConfiguredError`, mapped in
  `lib/http/run-errors.ts`.

**Exit:** SC-06 believable on production.

## Phase 1 — Public face

- [~] **T-1.1** Logged-out value prop on the auth surface — `app/(auth)/login/page.tsx`.
- [ ] **T-1.2** *(optional)* Static screenshot of hurdles or pack in `/public`.
- [x] **T-1.3** No "no signup demo" wording anywhere on the auth surface.

**Exit:** SC-09.

## Phase 2 — Default Instant

- [x] **T-2.1** Authenticated `/` redirects to `/start` — `app/page.tsx`; verified live
  (`/` → 307 → `/login?next=/start`, and signed in → `/start`).
- [~] **T-2.2** Instant nav is exactly Start · Hurdles · Pack · Publish · Next, and every
  entry resolves **inside** the Instant shell — `app/(growth)/layout.tsx`.
  Was broken at audit: `/next` did not exist (404) and `/publish` rendered the ops job
  board in the ops shell. `/next` now exists as destination 5 of 5
  (`app/(growth)/next/page.tsx`: receipts + exactly three next actions), and `/publish` is
  now the Instant screen (`app/(growth)/publish/`) with the ops board moved to
  `/advanced/publish`. All five entries resolve inside the Instant shell.
- [x] **T-2.3** The ops console is reachable only via Advanced — `app/(ops)/layout.tsx`
  is rooted at `/advanced` and the Instant shell links it from the footer, not the nav.
- [x] **T-2.4** No banner or help string claims nothing works without approved claims —
  `app/(ops)/help/page.tsx` and `app/(ops)/advanced/page.tsx` already say "approved claims
  **or** auto-extracted product facts".
- [~] **T-2.5** First Instant analyze does not require Knowledge → Claims — the four
  first-run gates were removed in spec 003 T-A7; `lib/prompts/assemble.ts` binds on
  `product_facts`. Production proof rides with T-0.4.

**Exit:** SC-02, SC-07.

## Phase 3 — Core loop (analyze + pack)

- [~] **T-3.1** Error taxonomy: extract / ai_config / ai_provider / auth —
  `lib/http/run-errors.ts` (422 refusals, 502 fetch, 401/403 auth, 409 unbound, 429 cap,
  separate config vs provider).
- [~] **T-3.2** Instant analyze unbound path (page text / `product_facts`) with the
  forbidden filter still on — `lib/growth/analyze.ts`, `findForbiddenClaims()`.
- [x] **T-3.3** Goal `other` free text capped and injected into prompts —
  `GROWTH_GOALS` + `goalNote` in `app/(growth)/start/actions.ts`.
- [ ] **T-3.4** `[owner]` Production dogfood: `https://lumo-learn.com` → hurdles list.
- [ ] **T-3.5** `[owner]` **P0 — `0016` is half-applied on production.** Probed at commit
  `3fcef69` as the service role via `/api/health`: `analyze_runs.goal`,
  `analyze_runs.hurdles`, `publish_jobs` and `growth_packs.angles` are all present, and
  **`product_facts` does not exist**. So `0016`'s two `add column if not exists` statements
  landed and its `create table public.product_facts` did not.
  Consequence: `product_facts` is what binds a first run with no approved claims, so SC-02
  fails on production today and T-0.4 would surface it as a 409 that reads like a
  claim-gate bug rather than a missing table.
  Fix: re-run `supabase/migrations/0016_growth_instant_facts.sql` on the production project
  (dashboard → SQL Editor). Re-running is safe — the ALTERs no-op; the CREATE TABLE and its
  four RLS policies are what is missing. `/api/health` flips to 200 with
  `migrations.applied: true` when it is done.
- [~] **T-3.6** Generate pack from Hurdles → `/pack` with ≥3 angles and ≥5 editable posts —
  `app/(growth)/pack/`, `lib/growth/pack.ts`.
- [~] **T-3.7** Posts persist for the publish pipeline as `content_drafts` rows —
  `app/(growth)/pack/page.tsx` reads them back and re-validates the jsonb payload.
- [~] **T-3.8** Instagram drafts are non-publishable until Meta is live —
  `isPublishablePlatform()` in `lib/growth/pack.ts`, enforced in the Pack UI.

**Exit:** SC-01, SC-03, SC-04, SC-08.

## Phase 4 — One publish path (LinkedIn)

- [x] **T-4.1** Connector secrets set on Vercel Production and redeployed.
- [ ] **T-4.2** `[owner]` LinkedIn OAuth connect completes in the production UI; tokens
  stay server-side (sealed by `CONNECTOR_TOKEN_KEY`, never `NEXT_PUBLIC_*`).
- [~] **T-4.3** Approve one pack draft → publish → receipt visible **on the Instant path** —
  `app/(growth)/publish/` (D-1 resolved: option (a), an Instant screen). Connect → approve →
  publish → receipt, with retry on a failed or blocked attempt. No publishing logic was
  written: it calls `decide_on_draft()`, `enqueue_publish_job()` and `executePublishJob()`,
  the same paths the ops board uses, so the cap, the forbidden check on the final body and
  idempotent retry cannot differ between the two screens. The OAuth round trip returns to
  `/publish` instead of ops settings via a one-value cookie (`CONNECT_RETURN_COOKIE`) —
  never a redirect target from the request.
- [ ] **T-4.4** `[owner]` Confirm on production: daily cap honoured, forbidden check on the
  final body, no double-post on retry (guards exist and are covered by
  `scripts/check-publish-guards.mjs`).

**Exit:** SC-05.

## Phase 5 — Observability and lock

- [~] **T-5.1** Structured analyze logs (run id, error class, latency, model id; no
  secrets) — `lib/obs/log.ts`, one JSON line per attempt from both the server actions the
  UI calls (`app/(growth)/start/actions.ts`, `app/(growth)/pack/actions.ts`) and their API
  twins. `error_kind` buckets failures as extract / ai_config / ai_provider / auth / cap /
  refusal, which is SC-08 made queryable.
- [~] **T-5.2** Health/config signal for "AI configured" — `GET /api/health`
  (`app/api/health/route.ts`). Booleans and the model name only, never a value; 503 when AI
  or Supabase config is missing; attempts no generation, so it proves presence, not a
  working key (that is T-0.4).
- [x] **T-5.3** `docs/dogfood-production.md` — the owner's six steps, the error-taxonomy
  table that says what each failure message means, and where to read the logs.
- [x] **T-5.4** Backlog freeze recorded in three places that bind: constitution R9, the
  spec's Out of scope, and Non-tasks below. The 7-day green window starts at the dogfood
  sign-off line in `docs/dogfood-production.md`.

## Decisions taken

- **D-1 — the shape of Instant Publish.** Resolved 2026-11-15 in favour of an Instant
  publish screen in the `(growth)` shell that reuses the existing connector, approval and
  publish-job code; the ops job board moved to `/advanced/publish`. Rejected: keeping the
  ops board on the primary path (cheaper, but the primary path would leave its own shell
  mid-loop), and reskinning the board inside the Instant shell (a screen that is neither a
  founder view nor an operator view).

## Non-tasks (do not open this milestone)

Video generation · voice generation as a product · lead generation and auto-outreach ·
additional social networks · a full visual redesign beyond the Phase 1 strip.

## Production dogfood checklist (owner)

1. Open production logged out → read the value prop.
2. Sign in → land on Start.
3. Paste `https://lumo-learn.com` → hurdles appear, with no Claims step.
4. Generate pack → edit a post on Pack.
5. Connect the publish channel → approve → publish → see the receipt.
6. Open Advanced → confirm ops is still available without being the default home.

## Milestone complete when

SC-01–SC-09 are green on production, the dogfood checklist passes with the owner alone,
and the expansion features remain explicitly deferred.
