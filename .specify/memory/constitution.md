# Lumo Grow Constitution

**Status: BINDING for all implementation.**

App name: Lumo Grow.
Product type: B2B multi-tenant growth platform (not a student learning app).
First workspace: Lumo Learn (dogfood).

## Core Vision

Teams connect a product or niche and get multiplied output across research, strategy,
media, publishing, lead intake, and learning — without hiring in linear proportion to
content volume. Control (claims, roles, approvals, caps, audit) scales from solo founder
to large teams.

## Core Principles

### I. Product Truth First (amended v3.0.0)
Every workspace has knowledge + approved claims + forbidden claims + voice. That
knowledge base is the only source of product claims for that workspace: no hardcoded
product facts, no per-feature claim stores, no cross-workspace borrowing.

**First-run carve-out (v3.0.0):** the knowledge base may be *seeded automatically* by
extracting product facts from the user's public pages — it is no longer a manual form the
user must complete before seeing a first result. Auto-extracted facts are marked as
unconfirmed, remain editable, and are still the single source of claims for that
workspace. What changed is how the base gets populated, not its authority. Blocking the
first run on an empty claim form is now a bug (see UX Principle 4).

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
Lumo must be runnable as a workspace on Lumo Grow. If the founders would not use it for
their own growth work, the scope is wrong.

## Product Experience Principles (v3.0.0 — BINDING for product UX and MVP scope)

The MVP first-run experience is **Growth Instant**: paste a product URL, see growth
hurdles, get ready content, and publish. These principles govern UX and MVP scope; they
constrain but do not repeal Principles I–X.

1. **Time-to-value first.** Useful output in under 2 minutes; full pack under 5.
2. **URL-first onboarding.** Primary input is a website link + optional goal.
3. **The product finds hurdles.** The user does not diagnose alone.
4. **No claim wall on first run.** First run must not be blocked by empty manual claim
   forms (see the Principle I carve-out above).
5. **Auto-extract product facts** from public pages; the user may edit later.
6. **Safety defaults are silent.** No fake guarantees, and no setup homework to get them.
7. **Publish is part of the core promise** — not an afterthought.
8. **Five screens max** on the main MVP path; everything else is Advanced.
9. **Every step earns its place.** If a step does not create a result or remove a hurdle,
   cut it or hide it.
10. **Dogfood the full loop.** Lumo must complete link → hurdles → pack → publish.

## MVP Scope

**In scope:**
- Start (URL + goal)
- Public site analysis → hurdles
- Growth pack (angles + posts + light plan)
- Connect channel + approve & publish (LinkedIn first)
- Next actions + basic publish receipt
- Optional Advanced: edit product facts, audit, team invites

**Out of scope (MVP):**
- Mandatory knowledge-wiki before first result
- Auto-publish rule engines as the primary path
- Cold lead scraping / unsolicited outreach
- All six networks publishing at once
- Complex plan-tier UX on first run
- Full CRM

Out-of-scope items are deferred, not repealed: workspace-wide knowledge, `auto-within-rules`
publishing, and multi-network distribution remain constitutional (Principles III–V) and
return after MVP. They must not be the first-run path.

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

**Generation-time rules (v3.0.0):**
- Never invent certifications, ranks, or guaranteed outcomes.
- Forbidden patterns are applied automatically during generation — not left to review.
- Publish only to OAuth-connected accounts the user owns.
- Default publish mode for new workspaces: `approve-then-publish`.

## Stack Defaults

- **App:** Next.js (App Router) + TypeScript strict + Tailwind
- **DB/Auth:** Supabase (Auth + Postgres + RLS)
- **AI:** Server-side LLM calls only; provider keys never reach the browser
- **Hosting:** Vercel
- **Channels:** Official OAuth APIs where available
- **Notify:** Email

## Recovery Milestone (v5.1.0-recovery — BINDING for this milestone)

Ratified by the owner on 2026-11-15, after production review. This milestone exists
because the product over-invested in ops surface and under-delivered a reliable core
loop **on production**. These rules are additive: Principles I–X and the v3.0.0 Product
Experience Principles are unchanged, and where this section is stricter, it wins for the
duration of the milestone.

The core loop is: **sign in → paste a public product URL → see growth hurdles → get a
content pack → publish at least once to a connected channel.**

### R1. Live proof is the only "done"
A task is not done when code is merged. It is done when a human completes the relevant
step on **production**. Local green with production red is red.

### R2. One primary path
Main product chrome is only **Start → Hurdles → Pack → Publish → Next**. Full ops
(Knowledge, Research, Strategy, Campaigns, Leads, Audit, …) lives under **Advanced**,
never as the default home. A main-nav entry that 404s or leaves the Instant shell is a
violation, not a cosmetic gap.

### R3. Auth before Instant
Users must be signed in before analyze/pack/publish. Do not re-open an unauthenticated
public demo that burns AI credits.

### R4. Production configuration is product work
Missing AI keys, connector secrets, or unapplied migrations on Production are **P0
defects**, not ops footnotes.

### R5. Honest errors
Extract failure may say the page could not be read. AI-config, AI-provider, and
claim-gate failures must **not** be phrased as "we could not read your page."

### R6. First run must not require manual claims
Instant analyze may run on page text and/or auto-extracted product facts. Blocking first
value on an empty approved-claims form is a bug (restates Principle I's carve-out as a
milestone gate).

### R7. Safety remains
Forbidden-claim filtering, human approval before publish, daily caps, and no auto-outbound
to strangers remain in force.

### R8. Billing safety
Checkout transactions that attach `user_id` must be **server-created**. Client-only price
checkout must never be able to forge another user's identity.

### R9. Explicit non-scope
Until the core path is green on production for a sustained period (~7 days), do not build
video generation, voice/TTS productization, lead scraping or auto-contact, or social
networks beyond the single publish path chosen for this milestone.

### R10. Self-audit after every task
Answer in the PR or handoff: (1) Does this match this constitution? (2) Can a signed-in
user complete the affected step on production?

### Anti-patterns (refuse)
New main-nav items; rebuilding the entire ops console; "prompt improvements" with no
production dogfood; declaring Instant complete while `/pack` or publish is dead; scope
into Lumo Learn (the study product).

### Success standard
The product is no longer "a password form with ambition" only when production dogfood of
URL → hurdles → pack → one publish works without an engineer driving.

## Governance

This constitution supersedes all other practices. Amendments require an explicit version
bump and a dated entry below.

**Self-audit — run on every task before reporting completion:**
1. Does this multiply team output, or only create orphan drafts?
2. Are approved/forbidden claims enforced in the prompts this task touches?
3. Is all data scoped by `workspace_id` and isolated by RLS?
4. Is the publish path explicit, mode-attached, and authorized to a connected account?
5. Is a measurable outcome possible for this work?

**First-run self-audit (v3.0.0) — run on any task touching the MVP path:**
6. Does a first-time user get value without a training doc?
7. Is the main path still ≤5 screens?
8. Is the claim wall still out of the first run?
9. Can they publish after one approval?

**Version**: 5.1.0-recovery | **Ratified**: 2026-09-11 | **Last Amended**: 2026-11-15

### Amendments

- **5.1.0-recovery - 2026-11-15:** Added the **Recovery Milestone** section (rules R1-R10)
  after a production review found the core loop unreliable on production while ops surface
  kept growing. **No principle repealed.** What changes: "done" now means a human completed
  the step on production (R1), production configuration is product work at P0 (R4), the error
  taxonomy must distinguish extract / ai_config / ai_provider / auth (R5), and video, voice,
  lead scraping and extra networks are frozen until the core path stays green ~7 days (R9).
  The version jumps 3.1.0 to 5.1.0 at the owner's instruction to match the external milestone
  numbering; 4.x was never ratified. IMMUTABLE for this milestone unless the owner amends in
  writing.

- **3.1.0 — 2026-09-16:** Renamed the product from **Lumo-Ops** to **Lumo Grow**. "Ops" was
  v2.0 heritage from the internal-operations framing; v3.0 reframed the product around
  growth outcomes, and the name now matches. **Brand only — no principle changed.**
  Internal identifiers deliberately keep the `lumo-ops` slug: the auth and workspace
  cookies, the `x-lumo-ops-workspace` / `x-lumo-ops-secret` lead-ingest headers, the
  package name, the Supabase `project_id`, and the repository directory. Renaming those
  would log out active sessions and break configured lead sources for no brand gain.
  Applied migration headers and `history/` keep the old name as a dated record.
  **Growth Instant** remains the name of the MVP first-run experience, not the product.

- **3.0.0 — 2026-09-16:** Added the **Growth Instant** product-experience principles and an
  explicit MVP scope, binding for product UX and MVP scope. **Breaking change to Principle I:**
  the knowledge base may now be seeded by auto-extraction from public pages, and a first run
  blocked on an empty manual claim form is a bug — the knowledge base remains the single
  source of claims, but it is no longer a precondition for first value. Adds time-to-value
  budgets (first output <2 min, full pack <5 min), URL-first onboarding, a five-screen cap on
  the main path, and LinkedIn-first publishing. Principles II–X are unchanged; multi-network
  publishing, `auto-within-rules` as a primary path, and the full knowledge wiki are deferred
  out of MVP, not repealed. Any spec or screen that requires manual claim entry before the
  first result must be revisited against UX Principles 1–5.

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
  Workspaces". The product is a SaaS for any app, not an internal team tool: anyone can
  sign up and create workspaces. Workspace isolation via RLS is unchanged. Supersedes the
  "workspace creation is a seed/admin action" part of ADR-0001.
