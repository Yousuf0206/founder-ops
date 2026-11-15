# Feature Specification: Recovery Milestone (post-roast)

**Milestone:** 5.1.0-recovery
**Status:** BINDING (owner-ratified 2026-11-15)
**Production:** https://lumo-ops.vercel.app
**Dogfood URL:** https://lumo-learn.com
**Constitution:** `.specify/memory/constitution.md` § Recovery Milestone (R1–R10)

## Problem statement

Lumo Grow was intended as an instant growth assistant for founders. In production it has
often presented as a login wall plus a heavy ops console, while the core loop
(analyze → pack → publish) was incomplete, misconfigured, or unreliable. Public visitors
cannot tell what the product does. Internal complexity outpaced proven value.

## Goals

1. Make the core loop reliable on production.
2. Make Instant the default signed-in experience.
3. Give logged-out visitors a clear one-screen explanation.
4. Ship **one** real publish path.
5. Defer expansion features until the core is stable.

## User scenarios

- **US1 — First value (must).** A signed-in founder pastes a product URL on Start and
  receives ranked growth hurdles, without opening Knowledge or Claims.
- **US2 — Content pack (must).** From hurdles, the founder generates a pack and edits
  posts on Pack.
- **US3 — Publish once (must).** The founder connects one channel, approves one draft,
  publishes, and sees a receipt.
- **US4 — Logged-out comprehension (must).** A visitor on login/signup understands what
  Lumo Grow does in under 10 seconds.
- **US5 — Advanced power user (should).** Existing ops tools stay reachable under
  Advanced without blocking Instant.

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-01 | Production: paste `https://lumo-learn.com` on `/start` → hurdles list (analysis job ready, target under 2 minutes when AI is healthy). |
| SC-02 | That run does not require manual approved claims. |
| SC-03 | Generate pack → `/pack` shows ≥3 angles and ≥5 editable posts. |
| SC-04 | Pack posts persist via the existing draft model (`content_drafts` or equivalent) for publish guardrails. |
| SC-05 | One connector publish works end to end: connect → approve → publish → receipt. |
| SC-06 | Production AI succeeds with configured keys; no systemic provider auth failures. |
| SC-07 | Signed-in `/` routes to Start (Instant entry), not claim-wall ops as the only home. |
| SC-08 | Errors distinguish extract vs AI config vs AI provider vs auth. |
| SC-09 | The logged-out login surface states the product purpose in plain language, with no false public-demo claim. |

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Production env includes valid AI provider credentials; missing config yields a clear user-facing error. |
| FR-02 | Instant analyze may run unbound by approved claims when page text / product facts bind the run. |
| FR-03 | Fetch/extract respect robots, timeouts, size limits, and the SSRF protections already intended by the stack. |
| FR-04 | Forbidden patterns apply to hurdles and posts. |
| FR-05 | An optional goal, including `other` free text (capped), is injected into analyze/pack prompts when provided. |
| FR-06 | Pack generation is a real action from Hurdles; `/pack` is a real route. |
| FR-07 | Instagram (if generated) is draft-only until the Meta connector is live. |
| FR-08 | Publish enforces approval, the daily cap, a forbidden check on the final body, and idempotent retry behaviour. |
| FR-09 | Connector tokens are server-side only; never exposed to the browser. |
| FR-10 | Minimal logged-out value prop on the auth screens. |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | The Instant primary path is usable on a mobile viewport. |
| NFR-02 | Secrets are never `NEXT_PUBLIC_*`. |
| NFR-03 | Analyze failures are diagnosable from structured logs (run id, error class, latency). |

## Out of scope

Video generation; voice generation as a product; lead generation / enrichment /
auto-outreach; multi-network publish expansion; a full marketing-site redesign; Lumo Learn
study features; replacing human approval with fully autonomous publish as the default.

## Assumptions

- Production Supabase can receive the required migrations.
- The owner can provide AI and LinkedIn (or chosen connector) production credentials.
- The dogfood URL remains `https://lumo-learn.com`.
