# Founder Ops Constitution

**Status: BINDING for all implementation.**

Product: Multi-workspace internal OS for marketing, content, sales intake, and R&D.
First tenant: Lumo Learn.

## Core Vision

Founder Ops helps small teams draft growth work from a single source of product truth —
research, content, campaigns, and inbound leads — with human approval before anything
goes public. It must work for Lumo Learn first and for additional apps via workspaces
without forking the codebase.

## Core Principles

### I. Draft, Never Auto-Publish (NON-NEGOTIABLE)
Bots prepare; humans approve. No code path may push content, messages, or changes to a
public or external surface without an explicit human approval action. Any task that
implies auto-publishing must be refused.

### II. One Knowledge Base Per Workspace
A workspace's knowledge base is the only source of product claims for that workspace.
No hardcoded product facts, no per-feature claim stores, no cross-workspace borrowing.

### III. Claims Bind Every Prompt
Approved claims and forbidden claims from the workspace knowledge base are injected into
every AI prompt for that workspace. Forbidden-claim enforcement is a prompt-construction
requirement, not a post-hoc filter.

### IV. No Cold Outreach or Bulk Messaging (v1)
Inbound only. No cold email, no bulk sends, no sequenced campaigns to non-consenting
recipients in v1.

### V. Team-Only, Never Student-Facing
This is an internal operations tool. No student accounts, no student-facing surfaces, no
mixing into student UX. Access is team-only and enforced by Supabase RLS.

### VI. Multi-Workspace From Day One
Every table, query, policy, and AI run carries `workspace_id` from the first migration,
even while the UI shows a single workspace. Additional apps onboard as workspaces, never
as forks.

### VII. Everything Audited
Every AI run and every approval is written to an audit log with actor, workspace, inputs
reference, and outcome.

### VIII. Cost Caps Are Mandatory
Each workspace has enforced daily AI run limits. A missing or unenforced cap is a bug,
not a backlog item.

### IX. Secrets Never Reach the Browser
API keys, service-role credentials, and provider tokens stay server-side. LLM calls are
made from server code only.

### X. Simple, Complete, Runnable
Prefer simple, complete, runnable work over partial agent theatre. Ship a working slice
rather than scaffolding for an unbuilt one.

## Product Boundaries

**In scope (v1):** Knowledge base, R&D reports, content drafts, approvals, inbound leads,
campaign drafts, audit logs, workspace isolation.

**Out of scope (v1):** Auto social publish, video rendering, full CRM, n8n requirement,
autonomous multi-agent loops, public third-party API, student accounts.

## Safety Levels

| Level | Handling | Examples |
|---|---|---|
| Low risk | Automatic | Summaries, internal reports, draft generation, lead classification |
| Medium risk | One-click human action | Optional single follow-up email send (off by default) |
| High risk | Human only / blocked in v1 | Public publish automation, bulk send, pricing changes, refunds, deleting another workspace's data |

## Stack Defaults (v1)

- **App:** Next.js (App Router) + TypeScript strict + Tailwind
- **DB/Auth:** Supabase (Auth + Postgres + RLS)
- **AI:** Direct server-side LLM calls (no Dify required for MVP)
- **Hosting:** Vercel
- **Notify:** Email first
- **First deploy:** Separate app or separate route group; not mixed into student UX

## Governance

This constitution supersedes all other practices. Amendments require an explicit version
bump and a dated entry below.

**Self-audit — run on every task before reporting completion:**
1. Does this respect draft-only external actions?
2. Is all data scoped by `workspace_id`?
3. Are forbidden claims enforced in the prompts this task touches?
4. Is this team-only with RLS?
5. Is anything auto-publishing? If yes → refuse.

**Version**: 1.0.0 | **Ratified**: 2026-09-11 | **Last Amended**: 2026-09-11
