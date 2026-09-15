# Lumo-Ops Constitution

**Status: BINDING for all implementation.**

App name: Lumo-Ops.
Product type: B2B multi-tenant growth platform (not a student learning app).
First workspace: Lumo Learn (dogfood).

## Core Vision

Teams connect a product or niche and get multiplied output across research, strategy,
media, publishing, lead intake, and learning — without hiring in linear proportion to
content volume. Control (claims, roles, approvals, caps, audit) scales from solo founder
to large teams.

## Core Principles

### I. Product Truth First
Every workspace has knowledge + approved claims + forbidden claims + voice. That
knowledge base is the only source of product claims for that workspace: no hardcoded
product facts, no per-feature claim stores, no cross-workspace borrowing.

### II. No Invented Product Facts
If a fact is unknown, the system says unknown. Unsafe or unsupported claims are refused,
not hedged. Approved and forbidden claims are injected into every AI prompt for that
workspace — enforcement is a prompt-construction requirement, not a post-hoc filter.

### III. Distribution Is In Scope
Publishing and scheduling are first-class product surfaces, restricted to accounts the
workspace has explicitly connected. Connectors use official OAuth APIs where available.
Posting to non-owned accounts is never permitted.

### IV. Humans Set The Mode (NON-NEGOTIABLE)
Every publish path runs in exactly one workspace-configured mode:
`draft-only` | `approve-then-publish` | `auto-within-rules`. Mode is explicit, visible,
and owner-controlled. A publish code path with no mode attached is a bug, not a default.

### V. Auto-Publish Never Bypasses Guardrails
`auto-within-rules` still runs claim checks and still respects daily caps. There is no
code path that publishes while skipping either. Missing or unenforced caps are bugs.

### VI. No Cold Spam
No scraping strangers for unsolicited outreach. Leads are inbound or come from explicitly
compliant sources. Bulk unsolicited messaging is blocked.

### VII. Workspace Isolation Is Absolute
Every table, query, policy, and AI run carries `workspace_id`. A user sees only the
workspaces they are a member of, enforced by Supabase RLS (or equivalent). Isolation is
not a UI concern.

### VIII. Everything Audited
Every AI run, every publish action, and every approval is written to an audit log with
actor, workspace, inputs reference, and outcome.

### IX. One Platform, 1→N Teams
Team size is handled by roles, not by separate products. A solo founder and a large team
run the same codebase with different role assignments and approval requirements.

### X. Dogfood
Lumo must be runnable as a workspace on Lumo-Ops. If the founders would not use it for
their own growth work, the scope is wrong.

## Agent Boundaries

**In scope:** analyze a public product URL or content; R&D from supplied inputs; score
campaign ideas; produce multi-platform drafts; publish via OAuth to connected accounts;
ingest inbound leads; pull performance metrics; recommend next actions; update workspace
knowledge with human confirmation.

**Out of scope (v2.0 launch):** mass unsolicited outreach; posting to non-owned accounts;
guaranteed rank or revenue claims; silent publish with no mode or caps.

## Safety Levels

| Level | Handling | Examples |
|---|---|---|
| Low | Automatic | Internal research, drafts, classification |
| Medium | One-click approval or queue | Single publish to a connected account |
| High | Owner only | Auto-publish rules, secret rotation, role changes |
| Blocked | Refused | Bulk unsolicited messaging, claim-violating copy |

## Stack Defaults

- **App:** Next.js (App Router) + TypeScript strict + Tailwind
- **DB/Auth:** Supabase (Auth + Postgres + RLS)
- **AI:** Server-side LLM calls only; provider keys never reach the browser
- **Hosting:** Vercel
- **Channels:** Official OAuth APIs where available
- **Notify:** Email

## Governance

This constitution supersedes all other practices. Amendments require an explicit version
bump and a dated entry below.

**Self-audit — run on every task before reporting completion:**
1. Does this multiply team output, or only create orphan drafts?
2. Are approved/forbidden claims enforced in the prompts this task touches?
3. Is all data scoped by `workspace_id` and isolated by RLS?
4. Is the publish path explicit, mode-attached, and authorized to a connected account?
5. Is a measurable outcome possible for this work?

**Version**: 2.0.0 | **Ratified**: 2026-09-11 | **Last Amended**: 2026-09-15

### Amendments

- **2.0.0 — 2026-09-15:** Major rewrite. Product renamed from "Founder Ops" to **Lumo-Ops**
  and reframed from an internal OS to a B2B multi-tenant growth platform. **Breaking change to Principle I of v1.x:**
  "Draft, Never Auto-Publish" is replaced by human-set publish modes
  (`draft-only` | `approve-then-publish` | `auto-within-rules`) — publishing and
  scheduling to workspace-connected accounts are now in scope, with claim checks and
  daily caps mandatory on every mode including auto. Distribution, inbound lead intake,
  metrics pull, and next-action recommendation added to agent scope. Dogfood requirement
  added as Principle X. Any v1-era code or spec that hard-refuses all publishing must be
  revisited against Principles III–V.
- **1.1.0 — 2026-09-15:** Principle V changed from "Team-Only" to "Open Sign-Up, Isolated
  Workspaces". Founder Ops is a SaaS for any app, not an internal team tool: anyone can
  sign up and create workspaces. Workspace isolation via RLS is unchanged. Supersedes the
  "workspace creation is a seed/admin action" part of ADR-0001.
