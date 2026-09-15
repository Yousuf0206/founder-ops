---
id: 0015
title: App Name Lumo-Ops
stage: constitution
date: 2026-09-15
surface: claude-code-cli
model: claude-opus-5
feature: (none)
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [constitution, naming, rename, breaking-change]
links:
  spec: specs/001-founder-ops-core/spec.md
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - .specify/memory/constitution.md
tests:
  - (none)
---

## Prompt

The app name will be Lumo-Ops

## Response snapshot

Applied the name to the governing document only: `.specify/memory/constitution.md`
is now titled "Lumo-Ops Constitution", carries an explicit `App name: Lumo-Ops.`
line, names Lumo Learn as the first (dogfood) workspace, and records the rename in
the v2.0.0 amendment entry ("renamed from Founder Ops to Lumo-Ops").

Did NOT sweep the codebase. A grep for `founder.?ops` found 40 references across
app UI, specs, migrations, and `package.json`, and three of them are wire contracts
rather than copy:

- `x-founder-ops-workspace` / `x-founder-ops-secret` — public lead-ingest headers
  (`app/api/ops/leads/ingest/route.ts:29-30`), also documented at
  `app/(ops)/settings/page.tsx:109-110` and printed by `supabase/seed/set-ingest-secret.ts:71-72`
- `founder-ops-workspace` cookie (`lib/auth/session.ts:11`) and
  `founder-ops-auth-next` cookie (`app/auth/callback/route.ts:7`)
- `"name": "founder-ops"` in `package.json:2`

Renaming the headers breaks any live inbound-lead integration; renaming the cookies
signs out existing sessions. Surfaced these to the user as a separate decision.

## Outcome

- ✅ Impact: Constitution now names the app Lumo-Ops; no runtime behaviour changed.
- 🧪 Tests: (none — document-only change)
- 📁 Files: `.specify/memory/constitution.md`
- 🔁 Next prompts: decide the rename scope — (a) user-visible copy + `package.json`
  only, (b) also cookies, (c) also ingest headers with a dual-accept compatibility
  window; then rename `specs/001-founder-ops-core/` or leave the branch-derived slug
  as historical.
- 🧠 Reflection: A product rename is cheap in prose and expensive on the wire. Splitting
  "name the product" from "rename the identifiers" kept a one-line instruction from
  silently invalidating a public ingest contract.

## Evaluation notes (flywheel)

- Failure modes observed: the tempting failure was a repo-wide find/replace on a
  four-word instruction, which would have broken the lead-ingest headers and dropped
  every active session cookie.
- Graders run and results (PASS/FAIL): (none)
- Prompt variant (if applicable): (none)
- Next experiment (smallest change to try): if the rename proceeds to headers, accept
  both `x-founder-ops-*` and `x-lumo-ops-*` for one release before dropping the old.
