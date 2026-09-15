# v2.0 Conformance Audit — 001-lumo-ops-core

**Date**: 2026-09-15
**Audited against**: `.specify/memory/constitution.md` — Lumo-Ops Constitution **v2.0.0**
**Audited artifacts**: `spec.md`, `plan.md`, `tasks.md`, `self-audit.md` (all written under v1.0.0)
**Status of this feature**: **CLOSED — superseded by v2.0.0.** No further implementation
against these documents. They remain as the record of the v1 core that was built.

> Why this document exists rather than an edit: v1 core was built and self-audited as a
> draft-only product. Rewriting those documents in place would erase the record of what was
> actually shipped and why. This audit names every conflict and says what v2 work inherits,
> what it discards, and what is newly missing.

---

## 1. Verdict

v1 core does not merely lack v2 features — **its central safety property is the inverse of
v2's.** v1's load-bearing principle was "Draft, Never Auto-Publish (NON-NEGOTIABLE)", and it
was enforced in the spec, the plan's Constitution Check, the database schema, the success
criteria, and a CI dependency guard. v2.0.0 Principles III–V make publishing a first-class
product surface under human-set modes.

So the reusable half of v1 is the part that v2 kept verbatim — claims binding, workspace
isolation, audit, caps, server-side secrets. The publish-refusal half is now wrong, and in
one place it is actively blocking: a CI guard fails the build if an OAuth publishing SDK
enters `package.json`.

---

## 2. Direct conflicts with v2.0.0

Each row is a v1 statement that a v2 implementation must contradict.

| # | v1 artifact | v1 statement | Conflicts with | Disposition |
|---|---|---|---|---|
| C1 | `scripts/check-no-publish.mjs` (wired into `npm run check`) | Build fails if `googleapis`, `twitter-api-v2`, `linkedin-api-client`, `@tiktok/*`, `telegraf`, … enter the dependency tree | III (publish via official OAuth APIs) | **Must be rewritten, not deleted.** See §4. |
| C2 | `spec.md` FR-A-003 | "MUST treat `published` as a manual status mark only and MUST NOT perform any publishing action" | III, IV | Replace: `published` becomes a real terminal state reached by a publish job. |
| C3 | `spec.md` SC-007 | "No system-initiated outbound publish or contact occurs in any code path" | III, IV, V | Replace with: no publish occurs outside a declared mode, to a non-connected account, past a claim check, or over cap. |
| C4 | `spec.md` US3 AC2 | Content draft status "is `awaiting_approval` — never `approved` or `published`" | IV | Status depends on workspace mode; `draft-only` keeps v1 behaviour, the other two modes do not. |
| C5 | `spec.md` US3 AC4 | "makes no call to any social platform or external publishing surface" | III | Discard. |
| C6 | `spec.md` US4 AC4 | Marking `published` causes "no outbound publish call" — "a record of manual action taken outside the app" | III, IV | Discard; approval in `approve-then-publish` mode now triggers the publish. |
| C7 | `spec.md` US6 AC3 | An approved campaign email draft causes no send | III (connected accounts only) | Narrow, don't discard: sends only to connected channels, never to leads (VI holds). |
| C8 | `plan.md` Constitution Check row I | "No outbound publish client exists in any layer" as a PASS condition | III | Whole table needs re-derivation against v2's ten principles. |
| C9 | `plan.md` Risks | "Scope creep to auto-publish" listed as risk #1, mitigated by "constitution block" | III–V | Invert: auto-publish is a feature; the risk is now *unguarded* auto-publish (no mode, no claim check, no cap). |
| C10 | `plan.md` Technical Context | "Internal team tool — single-digit users per workspace, two workspaces at v1" | IX (1→N via roles), product type B2B multi-tenant | Re-scope. |
| C11 | `spec.md` Users | "**Not users:** end students/customers. (Constitution V — team-only.)" | Already stale at v1.1.0 (open sign-up); v2 keeps open sign-up | Fix in v2 spec: the not-a-user is the *marketed product's* audience, not the platform's. |
| C12 | `spec.md` FR-Q-006 (Resolved) | Workspace creation is "seed/admin script only" | Superseded by the v1.1.0 amendment and the ADR-0001 note | Already contradicted by shipped code; restate in v2. |
| C13 | `self-audit.md` §1, §5 | "Nothing in the repository can publish, and the dependency guard keeps it that way" — recorded as a *pass* | III | Historical: true of v1, and no longer the goal. |
| C14 | `spec.md` FR-Q-005 (Open) | Telegram unscoped; `telegraf` blocked by CI | III | v2 answers it: Telegram is a connectable channel if the workspace OAuths it; still barred as a cold-outreach surface. |

---

## 3. What v1 built that v2 inherits unchanged

These carried straight across the version bump and should **not** be rebuilt:

| v1 mechanism | v2 principle it now serves | State |
|---|---|---|
| `assembleSystemPrompt()` — claim set is a required argument, throws `MissingClaimSetError` | I, II (claims bind every prompt, structurally) | 15 passing unit tests |
| `findForbiddenClaims()` output scan before save | II, V (the claim check auto-publish may not bypass) | passing; literal matches only |
| `workspace_id` on all 13 tables, `enable` + `force row level security` | VII (isolation absolute) | written; **RLS tests never executed** |
| `claim_ai_run()` — check-and-reserve under an advisory lock | V (caps hold under concurrency) | written; concurrency test never executed |
| `decide_on_draft()` — status change + approvals row + audit row in one function | VIII (audit inseparable from the action) | written, unrun |
| Log tables with no `authenticated` INSERT/UPDATE policy; `SECURITY DEFINER` writes only | VIII (actor cannot edit their own trail) | written, unrun |
| `scripts/check-public-env.mjs` | Stack default: secrets never reach the browser | **passing** |
| Invitations + `accept_invitation()` + the `can_approve` per-membership flag | IX (1→N via roles) | written, unrun |
| Ingest endpoint: workspace resolved from the verified secret, never the body | VI, VII | written, unrun |

**The caveat from `self-audit.md` still stands and is now older:** no migration has ever been
applied to a database, no AI provider has ever been called, no email has been sent, no lead
has been ingested. 53 integration tests are written and skipped. As of this audit they still
do not run — `npm test` gives 54 passed / 53 skipped / 4 files erroring with
`AuthRetryableFetchError: fetch failed` against `127.0.0.1:54321`. **Everything in the
"inherits" column above marked *unrun* is reviewed, not proven.**

---

## 4. The CI guard — the one item that blocks v2 work today

`scripts/check-no-publish.mjs` runs in `npm run check` and fails the build on any publishing
SDK. Under v2 it blocks the product's own roadmap: `googleapis` (YouTube), `twitter-api-v2`,
`linkedin-api-client` and `@tiktok/*` are all on its forbidden list.

Deleting it is the wrong move. Its own header comment explains why it exists: auto-publish was
risk #1, and the guard made the easy path impossible so that enabling publish required a
visible, reviewable deletion. That reasoning survives v2 — what changed is *which* thing must
be hard. v2's guardrails are: mode declared, account connected, claim check run, cap respected.

**Recommended replacement** (`scripts/check-publish-guards.mjs`), asserting in CI:

1. Every publish call site goes through one module (as `lib/ai/provider.ts` does for LLM
   calls) — no platform SDK imported anywhere else.
2. That module has no path to a send that skips the claim check or the cap reservation.
3. The bulk-messaging block **stays**: `@sendgrid/mail`, `mailchimp`, `twilio` and
   `nodemailer` remain forbidden under v2 Principle VI, with `resend` still the sole allowed
   single-send.
4. No publish target resolves from request input rather than a stored connected-account
   record — the same shape as the ingest endpoint's "resolve from the verified secret" rule.

Until that exists, leaving the v1 guard in place is the safer state: it fails loudly at the
moment someone adds a publishing dependency, which is exactly when this decision needs making.

---

## 5. Newly required by v2 — absent from v1 entirely

No v1 spec, schema, or code covers any of these:

- **Connected accounts** — OAuth connect/disconnect per channel, token storage and refresh,
  scope records, revocation. Nothing exists; there is no table and no connector layer.
- **Publish mode per workspace** — `draft-only` | `approve-then-publish` | `auto-within-rules`,
  owner-only to change (Safety level: High), visible in the UI. v1 is hardcoded to draft-only.
- **Publish execution and scheduling** — a publish job, a schedule, retries, and a
  publish-attempt record distinct from the draft's status.
- **Publish caps** — v1's `daily_run_cap` counts *AI runs* only. v2 Principle V requires a
  daily cap on *publishes*, enforced on the auto path.
- **Publish audit** — v1 FR-S-003 audits AI runs and approvals. v2 Principle VIII adds every
  publish action: actor (human or rule), mode, target account, claim-check result, outcome.
- **Auto-publish rules** — the rule objects `auto-within-rules` evaluates, owner-only.
- **Metrics pull** — reading performance back from connected accounts.
- **Next-action recommendation** — in v2 agent scope; no v1 equivalent.
- **Public product-URL and content analysis** as an input to knowledge; v1 only accepts
  pasted text.
- **Campaign idea scoring** — v1 drafts campaigns but does not score them.
- **Knowledge update with human confirm** — v1 knowledge CRUD is fully manual; v2 has the
  agent proposing updates that a human confirms.
- **Dogfood check (Principle X)** — no criterion anywhere asserts Lumo Learn runs as a
  workspace on Lumo-Ops.

---

## 6. Recommended next step

Open `002-*` against v2.0.0 rather than amending `001`. The natural first slice is the one
that unblocks everything else and carries the real risk: **connected accounts + publish mode
+ the guarded publish path**, with the CI guard replaced in the same slice so the build never
sits in a state where a publishing SDK is present and unguarded.

Two decisions want an ADR before that spec is written:

1. Publish-mode state machine, and where the claim check and cap reservation sit relative to
   the send — v1's `claim_ai_run()` advisory-lock pattern is the precedent to follow.
2. OAuth connector token storage and refresh — at-rest encryption, RLS shape, and revocation,
   given the secrets rule in Stack Defaults and Principle VII's isolation rule.
