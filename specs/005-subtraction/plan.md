# Implementation Plan: Subtraction Milestone 6.0.0

**Spec:** `specs/005-subtraction/spec.md` · **Tasks:** `specs/005-subtraction/tasks.md`

> The owner's paste ended inside this document, at the Target IA block. Everything from
> "Phases" onward is this plan's own continuation, written against the delivered work.

## Strategy

**Subtract and merge.** Do not rebuild the platform. Hide ops, unify Instant into Start +
Results, make Copy the win, keep Production AI honest. Every task should end with fewer
screens, fewer nav entries, or fewer required steps than it started with — a task that adds
a surface has to delete a larger one to pay for itself.

## Target IA (owner's, verbatim)

```text
Logged out:  Auth + one-line value prop
Logged in:   Start → Results
Buried:      /advanced/*  (everything else)
```

## Architecture stance

- Keep Next.js App Router + Supabase. No data model change: Results reads `analyze_runs`,
  `growth_packs` and `content_drafts` exactly as Hurdles and Pack did.
- The merge is a **UI** merge. Pack posts stay `content_drafts` rows with
  `source = 'growth_pack'`, so every publish guardrail from 002 and 004 still applies to
  them untouched, whether or not publish is ever used.
- Copy is client-side and server-free: `navigator.clipboard` on text the server already
  rendered. It costs nothing, needs no connector, and cannot fail in a way that loses work.
- Routes that stop being destinations are **not deleted** when a live user could be
  mid-flow in them. Publish and Next keep working; they lose their nav entries and every
  link that pushed a first run towards them. Hurdles and Pack *are* deleted, because their
  content moved rather than lost its promotion.
- Deleted URLs redirect permanently. `/hurdles` and `/pack` were primary destinations long
  enough to be bookmarked and sent in email.

## Phases

| Phase | Name | Maps to | Outcome |
|-------|------|---------|---------|
| 0 | Audit what recovery already satisfies | SC-05, SC-06, SC-07 | No work redone |
| 1 | Merge Hurdles + Pack into Results | FR-03 | One screen, two tabs |
| 2 | Copy as the primary action | SC-03, FR-06 | Every post copyable |
| 3 | Cut the nav to two | SC-04, FR-07 | Start · Results, Advanced buried |
| 4 | Redirects and link sweep | — | No dead ends, no stale pointers |
| 5 | Pin the contract | SC-03, SC-04 | A test fails when the nav regrows |

## Phase details

**Phase 0 — Audit first.** Half of this milestone's success criteria were already met by
5.1.0 and must not be rewritten: the logged-out value prop (SC-06, 004 T-1.1), the
four-way error split (SC-07, 004 T-3.1), facts-bind-the-first-run (FR-04), the forbidden
floor in code (FR-05), and `/` → Start (FR-01, 004 T-2.1). Confirm each against the repo
and against production `/api/health` before touching anything.

**Phase 1 — The merge.** `/hurdles` and `/pack` become one route. Move the pack route
folder to `results/` with history preserved, delete the hurdles page, and write a server
page that loads the latest analysis and the latest pack in parallel and renders two panels.
A small client component owns the tab state and receives both panels as server-rendered
children, so switching tabs refetches nothing and an in-progress post edit survives a look
at the problems. Posts is the default tab when posts exist, because the copyable output is
the outcome and the problems are the reasoning; Problems leads only when nothing is written
yet, when the one thing to do is generate. The angles — a full section on the old Pack
screen — collapse into a "Why these posts" disclosure.

**Phase 2 — Copy.** One client component: a function that assembles the post as it would be
pasted (hook, body, CTA, hashtags) and a button that writes it to the clipboard. It renders
on every post card, including posts for networks that cannot publish, since that is exactly
the case where copying is the only way to use the post. The clipboard API needs a secure
context and can be refused outright, so refusal is reported rather than swallowed.

**Phase 3 — The cut.** `NAV` in the Instant shell goes from five entries to two. Publish and
Next lose their entries. Advanced stays a footer link.

**Phase 4 — Sweep.** Start's action redirects to Results. The pack actions revalidate and
return to Results. Next's cards, Publish's empty state and every remaining `/hurdles` or
`/pack` href point at Results. `next.config.ts` redirects both old paths permanently.

**Phase 5 — The guard.** A unit test reads the layout and the Results components as source
and asserts the contract: exactly two nav entries and which, exactly two tabs, the old route
folders absent, the redirects configured, and Copy present in the read view of a post card
unconditionally. Restraint is what a codebase loses first, so it is asserted rather than
reviewed.

## Decisions worth recording

| Decision | Why | Alternative rejected |
|----------|-----|----------------------|
| Results is one route with two in-page tabs | Constitution R2 caps it there; the work is one thing | Two routes with cross-links — the shape being removed |
| Posts is the default tab | The copyable output is the outcome (R7) | Always leading with Problems, which buries the win behind reading |
| Publish and Next survive as routes, out of nav | A user mid-approval must not lose their screen; R1 prefers hiding | Deleting them, which would strand in-flight work |
| FR-07 satisfied by the ops shell, not URL moves | See spec.md § FR-07 as ratified | Relocating ~30 route folders |
| Tabs hold both panels mounted | Instant switching; no refetch; edits survive | `?tab=` on the server, which costs a round trip per glance |
| Contract asserted by reading source | The subject is a layout and two client components; a node test cannot render them, and the shape is what matters | A browser-level test, which this repo has no harness for |

## Risks

| Risk | Mitigation |
|------|------------|
| Bookmarked `/hurdles` or `/pack` 404s | Permanent redirects in `next.config.ts`, covered by the Phase 5 test |
| The nav regrows one reasonable entry at a time | `tests/unit/nav-contract.test.ts` fails on a third entry |
| A third Results tab gets added | Same test asserts the tab ids exactly |
| Posts tab hides a failed run | The run's status card lives in Problems *and* Problems becomes the default tab whenever no posts exist |
| Copy silently fails on an insecure context | The button reports refusal and tells the user to select the text |
| Scope creep into Advanced internals | Spec out-of-scope; access demoted, screens untouched |

## Definition of milestone done

SC-01 through SC-05 pass **on production**, and a non-engineer completes sign in → paste URL
→ read problems → copy a post without a guide or an engineer at the keyboard. Until that
holds, constitution R9 freezes video, voice, lead gen, further networks, new nav entries and
expanded ops UX.
