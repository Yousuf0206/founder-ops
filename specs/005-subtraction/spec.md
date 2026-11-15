# Feature Specification: Subtraction Milestone

**Milestone:** 6.0.0-subtraction
**Status:** BINDING (owner-ratified 2026-11-15)
**Production:** https://lumo-ops.vercel.app
**Dogfood URL:** https://lumo-learn.com
**Predecessor:** `specs/004-recovery/spec.md` (5.1.0-recovery)

> **Provenance.** The owner's pasted speckit set carried a complete constitution and
> sp.specify, and was truncated inside sp.plan — its Target IA block is the last text that
> arrived, and sp.tasks never did. The constitution and the requirement tables below are
> the owner's, reproduced. `plan.md` continues the strategy from where the paste stopped,
> and `tasks.md` is reconstructed from the delivered work rather than dictated — both are
> marked where they are inference rather than instruction.

## Problem statement

Lumo Grow was meant to ease marketing work. Recovery (5.1.0) made the loop real on
production: a founder can sign in, paste a URL, and get hurdles from a live AI provider.
What recovery did not do is make the product *small*. The shipped experience still reads as
a second system to operate — five primary destinations, a pack that lives somewhere other
than the problems that produced it, publishing presented as the finish line, and an ops
console with fourteen sidebar entries one footer link away. Users experience workload, not
relief.

## Goal

Subtract UI and workflow until the default product is a single simple path with copyable
output. No new capability. The only acceptable additions are the ones that let something
larger be removed.

## The only product promise

Sign in → paste a public product URL → see plain-language growth problems → get posts →
copy. Publish is optional and later.

## User scenarios

- **US1 — The whole product (must).** A signed-in founder lands on Start, pastes a product
  URL, and is taken to Results, which holds both the problems and the posts. They copy a
  post. No Claims visit, no Research, no Campaigns, no training.
- **US2 — Two things to look at (must).** The signed-in chrome offers Start and Results and
  nothing else. Results may split into at most two in-page tabs: Problems and Posts.
- **US3 — Advanced power user (should).** Everything the ops console ever did stays
  reachable through one buried link, never co-equal with the simple path.
- **US4 — Publish later (could).** A founder who wants to publish can still connect a
  channel and approve a post, but nothing on the simple path requires or suggests it.
- **US5 — Honest failure (must).** When a run fails, the founder can tell whether their
  page was the problem, our configuration was, or their session was.

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-01 | Signed-in production user pastes `https://lumo-learn.com` and gets hurdles without using Knowledge/Claims. |
| SC-02 | Same session shows usable posts (≥5 target) without a separate "learn Pack module" journey. |
| SC-03 | Each post has a working **Copy** action. |
| SC-04 | Default nav shows only Start and Results (Advanced buried, not co-equal). |
| SC-05 | Production AI configured; analyze does not fail with systemic provider auth errors. |
| SC-06 | Logged-out auth screen states what the product does in one short sentence (no false no-signup demo). |
| SC-07 | Errors distinguish extract vs AI config/provider vs auth. |

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Authenticated `/` → Start. |
| FR-02 | Start: URL field, optional goal, single primary button (Analyze / Get results). |
| FR-03 | Results surface combines problems + posts (one route preferred, e.g. `/results`). |
| FR-04 | Instant generation uses page extract / auto facts; no approved-claims gate on first run. |
| FR-05 | Forbidden patterns applied in code to outputs. |
| FR-06 | Copy-to-clipboard on each post. |
| FR-07 | All former primary ops routes reachable only under `/advanced/*` (or equivalent), not default nav. |
| FR-08 | Remove or rewrite copy that forces Claims before Instant value. |
| FR-09 | Production AI env vars set; clear error if missing. |
| FR-10 | Publish not required for SC pass; if present, must not be required on the critical path. |

### FR-07, as interpreted and ratified

The owner was asked how literally to read "under `/advanced/*`" and chose the *bury nav
only* reading (2026-11-15). The ops console keeps its current URLs — `/knowledge`,
`/analyze`, `/settings` and the rest — and qualifies under "or equivalent" because it lives
in its own shell, rooted at `/advanced`, reachable only from a footer link and never from
the default nav.

The rejected alternative was moving roughly thirty route folders under `app/(ops)/advanced/`
and rewriting around thirty-four files of links, `revalidatePath` calls and OAuth callback
URLs. That is a large mechanical diff with real breakage risk, and it buys URL cosmetics
rather than a smaller product — which NFR-03 and constitution R1 both argue against. If a
later milestone touches those routes anyway, the relocation rides along with it.

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Path completable on mobile. |
| NFR-02 | No secrets in `NEXT_PUBLIC_*`. |
| NFR-03 | Prefer deleting/hiding UI over adding settings to "manage complexity." |

## Out of scope

Video generation; voice generation; lead generation / auto-contact; multi-connector publish
expansion; a full marketing site; any redesign of Advanced internals (access is demoted, the
screens are not touched); Lumo Learn features.

## Assumptions

- The existing analyze and pack backends can feed a unified Results UI without schema change.
- The owner can set Production AI keys.
- The dogfood URL remains `https://lumo-learn.com`.

## What this milestone deliberately does not add

A tour, a wizard, a progress checklist, an empty-state carousel, a settings panel for
choosing which screens to show, or a third tab on Results. Each of those is a way of
managing complexity instead of removing it, and the five-destination nav this milestone
deleted was itself built one reasonable-looking addition at a time.
