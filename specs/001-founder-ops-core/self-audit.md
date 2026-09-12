# Constitution Self-Audit — v1 core

**Task**: T5.7 · **Date**: 2026-09-11 · **Scope**: Phases 0–5 as built on branch `main`

The constitution's section 6 requires six questions to be answered on every task. This is
that audit run against the finished v1 core.

> **Read this first.** Everything below is verified against *code*, by inspection and by
> the 41 unit tests that execute. **No migration has been applied to any database, and no
> AI provider has ever been called.** The 53 RLS and integration tests that would prove the
> database-level claims are written but skipped. Where a claim rests on unrun tests, it
> says so.

---

## 1. Does this respect draft-only external actions?

**Yes — verified three ways.**

| Mechanism | Where | Verified |
|---|---|---|
| No `fetch()` anywhere outside the AI provider module | `lib/`, `app/` | grep: zero hits outside `lib/ai/provider.ts` |
| Drafts cannot be born approved | `enforce_draft_birth_status` trigger on `content_drafts` and `campaigns` | unrun test |
| No UPDATE policy on `content_drafts` | `0004_content_approvals.sql` | unrun test — a client cannot set `status` directly |
| `published` is a status mark only | `mark_draft_published()` writes a status and an audit row, nothing else | code review |
| Publishing SDKs blocked at build | `scripts/check-no-publish.mjs` | **passing** |

The one outbound path in the product is `lib/email/notify.ts`, covered in §4.

## 2. Is data scoped by `workspace_id`?

**Yes.** All 13 tables carry `workspace_id` (`workspaces` carries it as `id`), and every
one has both `enable row level security` and `force row level security` — the latter so a
table owner connecting directly is still subject to policy.

```
workspaces  profiles  memberships  invitations  knowledge_docs  claim_sets
research_reports  content_drafts  approvals  campaigns  leads
ai_run_logs  audit_logs
```

Application queries also filter `workspace_id` explicitly, so intent is readable in the
code and enforced underneath it.

**Caveat**: `tests/integration/rls-full-isolation.test.ts` loops over all 13 tables to
prove a member of workspace A reads zero rows of workspace B, including one unfiltered
query where only RLS decides. **It has never run.**

## 3. Are forbidden claims enforced in prompts?

**Yes, structurally.** `assembleSystemPrompt()` takes the claim set as a *required*
argument and throws `MissingClaimSetError` when it is absent. Every generation path —
research, content, campaign, lead classifier — goes through it, so no code path can reach
a provider with an unbound prompt.

Verified by 15 **passing** unit tests, including that assembly throws without a claim set,
that every approved and forbidden claim appears in the output, and that the prompt forbids
implying and paraphrasing, not only stating.

Second line of defence: `findForbiddenClaims()` scans generated output before a draft is
saved, and a violation discards the draft and writes an audit row. It matches literal
reproductions only — paraphrases rely on the prompt.

## 4. Is this team-only with RLS?

**Yes.** Two gates: the membership check in `app/(ops)/layout.tsx`, and RLS underneath it.
No student-facing surface exists. `robots: { index: false, follow: false }`.

**The one sessionless route** is `POST /api/ops/leads/ingest`, authenticated by a
per-workspace shared secret stored as a SHA-256 hash and compared in constant time. It
resolves the workspace *from the verified secret*, never from the request body, so a caller
holding one workspace's key cannot write into another's.

**The one outbound message path** is `notifyTeamMember()`. It takes a single recipient,
which callers read from `workspaces.notify_email` — a team address. There is no code path
from a lead's email address to a send. (Constitution IV, T4.7.)

## 5. Is anything auto-publishing?

**No.** See §1. Nothing in the repository can publish, and the dependency guard keeps it
that way.

## 6. Cost caps and audit

- **Caps**: `claim_ai_run()` checks and reserves in one statement under an advisory lock,
  so two concurrent runs at the boundary cannot both pass — the edge case spec.md names. A
  refused run is itself logged, and refusals do not consume the cap. Default 50/day, UTC
  reset, owner-editable. *Proven only by unrun tests, including one that fires 10
  concurrent claims against a cap of 2 and expects exactly 2 to succeed.*
- **Audit**: `decide_on_draft()` performs the status change, the preserved original
  payload, the approvals row, and the audit row in one function — an approval cannot exist
  without its audit entry. Log tables have no INSERT or UPDATE policy for `authenticated`;
  they are written only by `SECURITY DEFINER` functions, so an actor cannot edit their own
  trail.

---

## What is NOT verified

1. **No database has ever run these migrations.** Six migration files, unapplied. Syntax
   errors, ordering problems, and policy mistakes would all surface on first apply.
2. **53 integration tests skipped**, covering every RLS claim, the cap, approval
   authority, and the isolation proof (SC-003).
3. **No AI provider has been called.** Every prompt, every JSON parse path, and the
   60-second timeout are untested against a real model.
4. **No email has been sent.** The Resend path has never executed.
5. **No lead has been ingested.** The secret comparison has never run.

## Assumptions standing in for unanswered questions

FR-Q-001 (editor approval rights), FR-Q-003 and FR-Q-004 (lead score, threshold,
vocabularies) were implemented as defensible defaults, not owner decisions. They are
recorded under "Assumptions Taken Without an Answer" in spec.md. FR-Q-005 (Telegram)
remains unanswered and unimplemented.

## Verdict

The code satisfies all six self-audit questions by construction. The constitution's own
principle X — *prefer simple, complete, runnable work* — is the one under strain: this is
complete and it builds, but "runnable" has not been demonstrated end to end even once.
