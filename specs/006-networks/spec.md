# Feature Specification: More Networks

**Milestone:** 6.1.0-networks
**Status:** BINDING (owner-directed 2026-11-15)
**Production:** https://lumo-ops.vercel.app
**Predecessor:** `specs/005-subtraction/spec.md` (6.0.0-subtraction)

## Where this sits against the freeze

6.0.0's constitution R9 froze "extra social networks" until SC-01–SC-05 stayed green on
production. They went green on 2026-11-15 (005 Phase 6), and the owner directed this
milestone the same day. The freeze is therefore lifted by its own terms rather than
ignored — but the 7-day green window named in `docs/dogfood-production.md` has not elapsed,
and two of 005's checks (NFR-01 on a phone, R3's non-engineer test) are still open. This is
recorded here rather than argued: the owner has the call, and this document is where a
later reader finds out it was a deliberate one.

The subtraction constitution still binds everything else. In particular R2 — Start and
Results are the only primary destinations — which is why this milestone adds **no new
screen and no new nav entry**.

## Problem statement

Lumo writes posts for six networks and could publish to exactly one. A founder's reward for
asking for LinkedIn, Facebook, Instagram and X content was four posts they had to carry to
four apps by hand. Copy is a real outcome (6.0.0 R7) and stays the default, but "we wrote
you a Facebook post and cannot post it to Facebook" is a gap, not a design.

## Goal

Publish to the networks we already write for, wherever the platform's own API makes it
possible — and be honest, in code and on screen, wherever it does not.

## User scenarios

- **US1 — Connect a network (must).** An owner connects a Facebook Page, an Instagram
  professional account, or an X account the same way they connect LinkedIn: one click, a
  platform round trip, a confirmation naming what was connected.
- **US2 — Publish to the right place (must).** A post written for X publishes to the
  connected X account; one written for Instagram goes to Instagram. No post is ever
  published through an account for a different network.
- **US3 — Instagram without an image (must).** A founder who has not added an image sees
  that the post needs one *before* approving, and Copy still works.
- **US4 — Scheduled posting survives short-lived tokens (must).** A post approved now and
  sent later still publishes, even on X, whose access tokens last about two hours.
- **US5 — Honest absence (must).** TikTok and YouTube are not offered as publish targets,
  and the reason given is the true one.

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-01 | An owner can connect a Facebook Page and see the Page name confirmed. |
| SC-02 | An owner can connect an Instagram professional account linked to that Page. |
| SC-03 | An owner can connect an X account, PKCE end to end. |
| SC-04 | A Facebook post publishes and returns a working permalink. |
| SC-05 | An Instagram post with an image URL publishes; one without is refused before approval with a sentence naming the cause. |
| SC-06 | An X post publishes and returns a working permalink. |
| SC-07 | A post is only ever published through an account of its own platform. |
| SC-08 | An X post scheduled beyond the access-token lifetime still publishes, via refresh. |
| SC-09 | TikTok and YouTube are absent from publish targets, with the video reason stated. |
| SC-10 | Default nav is still Start and Results; no screen was added. |

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | One Meta OAuth flow serves Facebook and Instagram; the platform in the callback decides which asset is kept. |
| FR-02 | Meta tokens are exchanged for long-lived ones; the stored credential is the Page token. |
| FR-03 | X uses OAuth 2.0 with PKCE; the verifier travels in the signed state cookie and never to the platform. |
| FR-04 | X access tokens are refreshed before publishing when they are near expiry, and the rotated refresh token is stored. |
| FR-05 | `lib/connectors/registry` is the single source of which platforms may publish; every route and screen reads it. |
| FR-06 | `requiresImage()` separates "this platform can publish" from "this post can publish". |
| FR-07 | Each connector maps its failures onto the existing `ConnectorError` taxonomy. |
| FR-08 | A connector is reachable only through `lib/publish/execute.ts`, enforced by `scripts/check-publish-guards.mjs`. |
| FR-09 | The pack writes for the four live networks, spread across them. |
| FR-10 | `image_url` is part of the content payload, defaulted so every existing draft still parses. |
| FR-11 | X posts are single posts, never threads. |
| FR-12 | `/api/health` reports credential presence per connector. |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | No secret in `NEXT_PUBLIC_*`; tokens stay sealed at rest and never reach the browser. |
| NFR-02 | No new primary destination, per 6.0.0 R2. |
| NFR-03 | A lost connection mid-publish is reported as `outcome_unknown`, never as a clean failure. |

## Out of scope

TikTok and YouTube publishing (video-only APIs; see plan.md); video or image *generation*;
threads on X; Instagram Stories, Reels and carousels; Facebook Groups; scheduling UI
changes; any redesign of Advanced.

## Assumptions

- The owner holds a Meta app, an X developer account on a paid tier, a Google Cloud project
  and a TikTok developer app (stated 2026-11-15). Only the first two are used here.
- Meta App Review and Business Verification are the owner's to complete; development-mode
  testing with their own Page is enough to prove the path.
