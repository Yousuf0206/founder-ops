# Implementation Plan: Growth Instant

**Feature Branch**: `003-growth-instant`
**Created**: 2026-09-16
**Status**: Draft
**Input**: Growth Instant — Plan v3.0 (user-authored, pasted into session)

> Governed by `.specify/memory/constitution.md` (Lumo Grow Constitution **v3.1.0**).
> WHAT lives in [`spec.md`](./spec.md). Tickets go in `tasks.md`.
> Code paths below were verified against the working tree on 2026-09-16.

## 1. Approach

Keep existing backend strengths (auth, workspaces, RLS, connectors, publish state machine)
where present. Replace the primary UX with the 5-screen instant path. Remove the first-run
dependency on manual claims.

## 2. Stack

- Next.js App Router + TypeScript + Tailwind
- Supabase Auth/DB/RLS
- Server LLM for analyze + pack
- LinkedIn OAuth publish
- Vercel + cron for schedules if needed — `app/api/ops/cron/publish-due` already exists

## 3. Architecture

```text
/start → API analyze
      → /hurdles
      → API generate pack
      → /pack
      → OAuth + API publish
      → /next

Advanced routes under /advanced/*
```

**Fetch layer**: public HTTP GET + HTML text extract, respecting timeout and size limit.
No headless browser required for MVP if static/SSR HTML is sufficient; upgrade later.
This layer exists today at `lib/analyze/fetch.ts` (robots.txt honoured, private-address
guard, size cap) and is reused rather than rewritten.

## 4. What already exists

Verified in the tree. This is what "where present" and "if exists" resolve to.

| Capability | Status | Location |
|---|---|---|
| Auth, workspaces, memberships, RLS | **Exists** | `supabase/migrations/0001_foundation.sql`, `lib/auth/` |
| Public-page fetch + extract | **Exists** | `lib/analyze/fetch.ts` |
| `analyze_runs` table | **Exists, needs columns** | `0009_analyze_strategy.sql` — has `source_url`, `status`, `product_summary`, `themes`, `content_gaps`, `claim_risks`, `unknowns`; **no `hurdles`, no `goal`** |
| LinkedIn connector | **Exists** | `lib/connectors/linkedin/oauth.ts`, `lib/connectors/linkedin/publish.ts`, `lib/connectors/registry.ts`, callback at `app/api/ops/connections/[platform]/callback` |
| Publish state machine, caps, receipts | **Exists** | `lib/publish/state.ts`, `enqueue.ts`, `execute.ts`; `publish_jobs` table |
| Scheduled publish cron | **Exists** | `app/api/ops/cron/publish-due` |
| Forbidden-claim enforcement in prompts | **Exists** | `lib/prompts/assemble.ts` |
| `product_facts` table | **Missing** | New in Phase A |
| `growth_packs`, `pack_posts`, `campaign_angles` | **Missing** | New in Phase B — see Open Decision 1 |
| `/start`, `/hurdles`, `/pack`, `/next` routes | **Missing** | New; the current app ships ~15 `(ops)` routes instead |

## 5. Claim-gate change

- **OLD**: refuse if `approved_claims` empty.
- **NEW**: allow if `product_facts` is non-empty from extraction **OR** user facts.
- Always apply the forbidden-pattern filter on outputs and pre-publish.
- The Advanced editor writes `product_facts` and optional `approved_claims`.

**The gate is enforced in two places, not one.** Both must change together, and they throw
different errors:

| Site | Current behaviour | Change |
|---|---|---|
| `lib/prompts/assemble.ts:67` | `throw new MissingClaimSetError()` — no claim set row at all | Accept a workspace with no claim set when `product_facts` is non-empty |
| `lib/prompts/assemble.ts:68` | `throw new EmptyApprovedClaimsError()` — claim set exists, approved list empty | Same condition — this is the claim wall proper |
| `lib/ai/run.ts:88` | `if (!claimSet) throw new MissingClaimSetError()` — pre-flight refusal before spending tokens | Must accept the same fallback, or generation still refuses before reaching the prompt assembler |
| `lib/http/run-errors.ts:37` | Maps the refusal to **409 — "fix the knowledge base"** | Must stop firing on the first-run path; a 409 here is SC-02 failing in production |

A silently-created workspace (`FR-GI-S-003`) has **no claim set row at all**, so the
`MissingClaimSetError` path — not just the empty-approved path — is the one a first run
actually hits. Changing only `EmptyApprovedClaimsError` would leave SC-02 broken.

**Unchanged**: forbidden claims still override, still inject into every prompt, and the
pre-publish claim check on the final edited body still runs (`FR-GI-U-007`,
Constitution IV–V). Only the *empty approved-list gate* is lifted.

## 6. Phases

### Phase A — Front door (priority)
- Start page + URL validation
- `analyze_run` pipeline + Hurdles UI
- Auto `product_facts` extraction
- Disable first-run claim wall

Schema: add `hurdles jsonb` and `goal` to `analyze_runs`; create `product_facts`.

### Phase B — Pack
- Generate pack endpoint
- Pack UI edit/select
- Persist `pack_posts`

### Phase C — Publish
- LinkedIn connect — **reuse the existing v2 connector**, confirmed present
- Approve & publish selected
- Receipt on job

Instagram variants are generated here but stay draft-only (`FR-GI-U-006`).

### Phase D — Next + polish
- Next screen
- Errors / empty / loading states
- Advanced: edit facts
- Dogfood Lumo URL end-to-end

## 7. Risks

| Risk | Mitigation |
|---|---|
| Thin sites / JS-heavy apps | Honest "limited scan" + manual goal still generates a pack |
| Hallucinated features | Prefer extracted quotes; mark low-confidence lines |
| Users skip publish | Make Publish the obvious primary CTA on Pack |
| Scope creep back to ops console | Constitution: 5 screens |

## 8. Definition of done

Lumo URL on Start → Hurdles visible → Pack generated without manual claims → one LinkedIn
post published → Next shows success.

## 9. Open decisions

Carried from `spec.md` plus two surfaced while checking the tree. None block Phase A.

1. **New pack tables, or reuse existing?** `strategy_ideas` (scored ideas) and
   `content_drafts` (platform variants, already wired to the publish path) closely resemble
   `campaign_angles` and `pack_posts`. Reusing them inherits the publish state machine for
   free; new tables keep the MVP shape clean but need their own path to `publish_jobs`.
   **Recommendation: reuse `content_drafts` for pack posts**, add `growth_packs` as the
   grouping row — otherwise Phase C rebuilds a publish path that already works.
2. **What happens to the ~15 existing `(ops)` routes** when the 5-screen path lands — moved
   under `/advanced/*`, left in place unlinked, or deleted? The nav contract only governs
   what is *reachable from main nav*.
3. **Workspace select rule** (`FR-GI-S-003`) — same URL, same owner, most recent? Shapes
   whether `product_facts` is per-workspace or per-analyze-run.
4. **Default daily cap** for a silently-created workspace — 002 FR-P-004 requires one on
   every mode; no default is named.
5. **Goal `other`** — free text into the prompt, or an inert label?
6. **Meta "already available" trigger** — merged connector, live token, or passing e2e test?
   `FR-GI-U-006` keys IG draft-only off this.
