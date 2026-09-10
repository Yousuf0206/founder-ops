---
id: 0001
title: Founder Ops Constitution v1
stage: constitution
date: 2026-09-11
surface: claude-code-cli
model: claude-opus-5
feature: (none)
branch: main
user: Yousuf0206
command: (direct prompt)
labels: [constitution, governance, founder-ops, lumo-learn]
links:
  spec: (none)
  ticket: (none)
  adr: (none)
  pr: (none)
files:
  - .specify/memory/constitution.md
tests:
  - (none)
---

## Prompt

# Founder Ops — Constitution v1.0
Status: BINDING for all implementation
Product: Multi-workspace internal OS for marketing, content, sales intake, and R&D
First tenant: Lumo Learn

## 1. Core vision
Founder Ops helps small teams draft growth work from a single source of product truth—
research, content, campaigns, and inbound leads—with human approval before anything
goes public. It must work for Lumo Learn first and for additional apps via workspaces
without forking the codebase.

## 2. Non-negotiable principles
1. Draft, do not auto-publish. Bots prepare; humans approve.
2. One knowledge base per workspace is the only source of product claims.
3. Approved claims and forbidden claims bind every AI prompt in that workspace.
4. No cold outreach or bulk messaging in v1.
5. No student-facing features. This is team-only.
6. Multi-workspace from day one in the data model (even if UI shows one workspace).
7. Every AI run and approval is audited.
8. Cost caps are mandatory (daily AI run limits per workspace).
9. Secrets never ship to the browser.
10. Prefer simple, complete, runnable work over partial agent theatre.

## 3. Product boundaries
IN SCOPE: Knowledge, R&D reports, content drafts, approvals, inbound leads,
campaign drafts, audit logs, workspace isolation.
OUT OF SCOPE v1: Auto social publish, video rendering, full CRM, n8n requirement,
autonomous multi-agent loops, public third-party API, student accounts.

## 4. Safety levels
- Low risk (auto): summaries, internal reports, draft generation, lead classify.
- Medium risk (one-click): optional single follow-up email send (off by default).
- High risk (human only / blocked in v1): public publish automation, bulk send,
  pricing changes, refunds, data deletion of another workspace.

## 5. Stack defaults (v1)
- App: Next.js (App Router) + TypeScript strict + Tailwind
- DB/Auth: Supabase (Auth + Postgres + RLS)
- AI: Direct server-side LLM calls (no Dify required for MVP)
- Hosting: Vercel
- Notify: Email first
- First deploy: separate app or separate route group; not mixed into student UX

## 6. Self-audit (every task)
- Does this respect draft-only external actions?
- Is data scoped by workspace_id?
- Are forbidden claims enforced in prompts?
- Is this team-only with RLS?
- Is anything auto-publishing? If yes -> refuse.

## Response snapshot

Ratified the constitution into `.specify/memory/constitution.md`, replacing the unfilled
Spec-Kit placeholder template. The ten non-negotiable principles became numbered Core
Principles (I-X); product boundaries, the safety-level table, and stack defaults became
their own sections; the six self-audit questions became a standing gate under Governance.
Version 1.0.0, ratified 2026-09-11. No application code exists yet.

## Outcome

- Impact: Project constitution is now the binding governance document for all Founder Ops work.
- Tests: none (governance document only)
- Files: `.specify/memory/constitution.md` (97 lines, replaced template)
- Next prompts: `/sp.specify` for the first feature slice (workspace + knowledge base schema with RLS).
- Reflection: Repo is a bare Spec-Kit scaffold; no Next.js app, Supabase project, or migrations exist yet.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
