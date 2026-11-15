# Implementation Plan: Recovery Milestone 5.1.0

**Spec:** `specs/004-recovery/spec.md` · **Tasks:** `specs/004-recovery/tasks.md`

## Strategy

Recover by **stabilising and proving** the existing Growth Instant architecture
(spec 003). Prefer env fixes, error-mapping fixes, redirect/copy fixes, and finishing one
publish path over rewrites.

## Architecture stance

- Keep Next.js App Router + Supabase + the existing growth routes.
- Instant is the product; Advanced is the legacy/power console.
- One AI provider, authenticated, on Vercel **Production**.
- One publish connector for this milestone (LinkedIn preferred — already the only
  connector with production secrets set).

## Phases

| Phase | Name | Maps to | Outcome |
|-------|------|---------|---------|
| 0 | Production baseline | SC-06 | AI and secrets work on Production |
| 1 | Public face | SC-09 | Login explains the product |
| 2 | Default = Instant | SC-07, SC-02 | Start is home; no false claim wall |
| 3 | Core loop | SC-01–SC-04, SC-08 | URL → hurdles → pack reliable |
| 4 | One publish path | SC-05 | Real publish + receipt |
| 5 | Observability & lock | NFR-03 | Logs + dogfood doc; expansion locked |

## Phase details

**Phase 0 — Production baseline.** Inventory env from the repo; set every required var on
Vercel Production; redeploy; verify one successful AI call against production; fail closed
with a clear message when AI is unset.

**Phase 1 — Public face.** Minimal value prop above the auth form (one sentence, up to
three bullets, optional screenshot). No claim of a no-signup demo. No marketing redesign.

**Phase 2 — Default Instant.** Authenticated `/` → `/start`. Nav is exactly
Start | Hurdles | Pack | Publish | Next, and every entry resolves inside the Instant
shell. Ops under `/advanced`. Rewrite claim-wall banners that contradict first-run Instant
rules; align help/FAQ strings with behaviour.

**Phase 3 — Core loop.** Analyze with the correct error taxonomy; unbound Instant analyze;
forbidden filtering; pack generation, persistence and editable UI; migrations applied on
the production DB.

**Phase 4 — One publish path.** Connector secrets on Production; OAuth connect with
server-side tokens; approve → publish → receipt; cap, forbidden check and idempotency
preserved.

**Phase 5 — Observability & lock.** Structured analyze logs; an AI-configured health
signal; `docs/dogfood-production.md`; an explicit backlog freeze on video/voice/leads
until the core stays green.

## Risks

| Risk | Mitigation |
|------|------------|
| Keys only on Preview | Phase 0 checklist forces Production (audited 2026-11-15: all vars present on Production) |
| Local green / prod red | Every SC check runs against the production URL |
| Scope creep | Constitution R9; the Phase 5 freeze |
| LinkedIn app delays | Secrets are already set; publish remains the last SC |

## Definition of milestone done

SC-01 through SC-09 pass on production, and the owner completes the dogfood checklist
without an engineer at the keyboard.
