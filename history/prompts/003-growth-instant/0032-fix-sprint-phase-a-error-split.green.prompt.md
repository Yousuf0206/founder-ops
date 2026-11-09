---
id: 0032
title: Fix sprint Phase A error split
stage: green
date: 2026-11-09
surface: agent
model: claude-opus-5-5
feature: 003-growth-instant
branch: main
user: Yousuf0206
command: none (pasted speckit set 5.0.0-fix)
labels: ["fix-sprint", "errors", "ai-provider", "sc-08"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - lib/ai/provider.ts
 - app/(growth)/start/actions.ts
 - app/(growth)/pack/actions.ts
 - tests/unit/provider-errors.test.ts
tests:
 - tests/unit/provider-errors.test.ts (7 passed)
 - tests/unit (203 passed before the new file was added)
 - tsc --noEmit (clean)
---

## Prompt

# Lumo Grow — Fix Sprint Speckit Set
**Version:** 5.0.0-fix  
**Product:** Lumo Grow (lumo-ops)  
**Production:** https://lumo-ops.vercel.app  
**Dogfood URL:** https://lumo-learn.com  
**Date:** 2026-11-09  

---

## 0. How to use this set

These four sections are binding for this sprint only:

1. **Constitution** — rules that cannot be broken  
2. **Specify** — what must be true (requirements + success criteria)  
3. **Plan** — how we deliver it  
4. **Tasks** — ordered work list  

**Out of scope until SC-01–SC-06 are green on production:** video generation, voice generation, lead generation.

**Rule for the team:** “Built” means a human can complete the path on production—not only that code exists locally.

---

# 1. `/speckit.constitution`

## Project
Lumo Grow — Growth Instant fix sprint

## Version
5.0.0-fix

## Status
BINDING for this sprint. Deviation requires owner sign-off in writing.

## Core vision (this sprint)
Make the product do one job reliably:

**Paste product URL → see growth hurdles → get a content pack → publish at least once.**

Anything that does not move that path on production is out of scope.

## Non-negotiable rules

1. **Live proof beats code claims.** Done means the path works on production with a real URL.
2. **One primary path.** Start → Hurdles → Pack → Publish. Advanced ops is secondary.
3. **Auth before Start.** No unauthenticated public demo that burns AI credits.
4. **Server-created billing transactions only** if checkout is touched; never trust client-supplied `user_id`.
5. **No auto-outbound** to strangers (no auto email, DM, or spam).
6. **No video, voice, or lead-gen automation in this sprint.** Those start only after the core path is green on production.
7. **Production secrets are part of done** (AI keys, connector secrets on Vercel Production + redeploy).
8. **Honest errors.** Do not map claim-gate or AI failures to “we could not read your page” unless extraction truly failed.
9. **Forbidden marketing claims** are filtered before user-facing hurdles/posts and before publish.
10. After every task, answer: *Does this match this constitution? Can a signed-in user complete URL → hurdles on production?*

## Anti-patterns (refuse)

- New main-nav destinations  
- Rebuilding the entire ops console  
- Prompt-only changes with no production run  
- Adding Meta / TikTok / YouTube before one publish path works  
- Scope into Lumo Learn (study product)  
- Declaring progress without production dogfood  

## Amendment
This constitution applies only to the fix sprint. Expansion (video / voice / leads) requires a new version after SC-01–SC-06 stay green.

---

# 2. `/speckit.specify`

## Problem statement
Lumo Grow was built so founders can paste a product link and get growth clarity and content without heavy setup. In practice, production has been blocked by missing or invalid AI credentials, incomplete end-to-end proof, a login-only public surface, and an unfinished publish path. Repeated internal work without a hard production gate did not create durable user value.

## Product intent
| Item | Definition |
|------|------------|
| Who | Founders and small teams |
| Job | Diagnose growth issues and produce publishable content from a product URL |
| Core loop | URL → hurdles → pack → publish |
| Not this sprint | Video gen, voice gen, lead gen/scraping |

## Success criteria

| ID | Criterion |
|----|-----------|
| SC-01 | Signed-in user pastes `https://lumo-learn.com` on `/start` and receives a **hurdles list** (target: analysis job ready in under 2 minutes). |
| SC-02 | First analyze does **not** require visiting Knowledge / adding approved claims. |
| SC-03 | From Hurdles, **Generate pack** produces ≥3 angles and ≥5 editable posts on `/pack`. |
| SC-04 | Pack posts are stored so existing draft/publish guardrails apply (`content_drafts` or current equivalent). |
| SC-05 | **One** publish path works end-to-end (LinkedIn preferred): connect → approve → publish → receipt visible. |
| SC-06 | Production AI calls succeed with configured keys (no systemic provider 401 / “Missing Authentication header”). |
| SC-07 | Signed-in `/` routes to **Start** (or equivalent Instant entry), not a claim-wall-only ops home. |
| SC-08 | Errors distinguish extract failure, AI failure, and configuration failure. |

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Production has valid AI provider credentials; if missing, user sees a clear configuration error. |
| FR-02 | Growth Instant analyze may run without approved claims when page text or auto product facts bind the run. |
| FR-03 | Fetch and extract work on typical marketing sites; thin pages are handled honestly (no silent invention). |
| FR-04 | Forbidden patterns drop or block unsafe hurdles and posts. |
| FR-05 | Pack generation is available from Hurdles; `/pack` is a real surface. |
| FR-06 | Publish enforces approval, daily cap, and forbidden checks; Instagram remains draft-only until Meta is live. |
| FR-07 | AI/config failure is detectable (clear error and/or simple health signal). |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Primary path remains usable on mobile viewport. |
| NFR-02 | No new social SDKs that auto-post without approval. |
| NFR-03 | Secrets never exposed as `NEXT_PUBLIC_*`. |

## Out of scope

- Video generation  
- Voice / TTS product features  
- Lead generation, enrichment, or auto-contact  
- Multi-network publish expansion  
- Full marketing-site redesign  
- Lumo Learn study features  

## Assumptions

- Growth-related Supabase migrations are applied or will be applied in tasks.  
- Owner can supply LinkedIn (or chosen connector) credentials for SC-05.  
- Dogfood URL remains `https://lumo-learn.com`.  

---

# 3. `/speckit.plan`

## Strategy
Stabilize the existing Growth Instant path. Prefer environment fixes and small code corrections over architecture rewrites.

## Phases

| Phase | Name | Primary SCs | Outcome |
|-------|------|-------------|---------|
| A | Production AI and errors | SC-06, SC-08 | AI works; errors are honest |
| B | URL → hurdles | SC-01, SC-02, SC-07 | Core diagnosis works on production |
| C | Pack | SC-03, SC-04 | Content pack works on production |
| D | One publish path | SC-05 | One real publish on production |
| E | Closeout | — | Checklist + explicit deferral of video/voice/leads |

## Technical approach

- **Stack:** existing Next.js app, Supabase, Growth Instant routes (`/start`, `/hurdles`, `/pack`, `/publish`).  
- **AI:** one paid, authenticated provider on Vercel Production; align with existing env names in the repo.  
- **Publish:** finish one connector (LinkedIn preferred); do not redesign the publish system.  
- **Claims:** keep safety filters; keep first-run analyze unblocked without manual claim entry.  

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Keys set only on Preview | Explicit Production env checklist + redeploy |
| Local green, production red | All SC checks use production URL |
| Scope creep | Constitution rule 6; Phase E backlog lock |
| Connector app review delays | Start D secrets early; SC-05 can be last |

## Definition of done (sprint)

- SC-01 through SC-06 pass on production  
- SC-07 and SC-08 pass  
- Owner completes dogfood without an engineer driving the keyboard  

---

# 4. `/speckit.tasks`

## Phase A — Production AI and errors

- [ ] **T-A1** List required AI/provider env vars from the repo. Set them on **Vercel Production**. Redeploy.  
- [ ] **T-A2** Ensure missing AI config fails with a clear user-facing message (not a raw provider 401).  
- [ ] **T-A3** Fix error mapping: extract fail vs AI fail vs config fail; never blame the page for AI/claim gate failures.  
- [ ] **T-A4** Manual production check: `/start` + dogfood URL; confirm error text is accurate if it fails.

**Phase A exit:** SC-06 and SC-08 are believable on production.

## Phase B — URL → hurdles

- [ ] **T-B1** Confirm first-run analyze does not deadlock on empty approved claims.  
- [ ] **T-B2** Confirm signed-in `/` → `/start` (or Instant entry); ops lives under Advanced.  
- [ ] **T-B3** Production: dogfood URL returns a hurdles list on `/hurdles`.  
- [ ] **T-B4** Confirm no mandatory Claims visit for that run.

**Phase B exit:** SC-01, SC-02, SC-07 green.

## Phase C — Pack

- [ ] **T-C1** Confirm pack-related DB migrations applied on production Supabase.  
- [ ] **T-C2** Generate pack from Hurdles → `/pack` shows ≥3 angles and ≥5 editable posts.  
- [ ] **T-C3** Confirm posts are persisted for the existing publish pipeline.  
- [ ] **T-C4** Confirm Instagram (if generated) is not publishable until Meta is live.

**Phase C exit:** SC-03, SC-04 green.

## Phase D — One publish path

- [ ] **T-D1** Put connector secrets on Vercel Production; redeploy.  
- [ ] **T-D2** Connect the account in the UI.  
- [ ] **T-D3** Approve one pack draft → publish → show receipt.  
- [ ] **T-D4** Confirm daily cap and forbidden checks still apply.

**Phase D exit:** SC-05 green.

## Phase E — Closeout

- [ ] **T-E1** Add a short production dogfood checklist to the repo (steps for owner).  
- [ ] **T-E2** Record backlog: video / voice / lead generation **blocked** until SC-01–SC-06 remain green for 7 days.

## Non-tasks (do not open)

- [ ] ~~Video generation~~  
- [ ] ~~Voice generation~~  
- [ ] ~~Lead generation / auto-outreach~~  
- [ ] ~~Additional social networks~~  

---

## 5. Production dogfood checklist (owner)

1. Sign in at production.  
2. Land on or open **Start**.  
3. Paste `https://lumo-learn.com` → submit.  
4. Confirm **hurdles** appear (no Claims step).  
5. **Generate pack** → confirm posts on **Pack**.  
6. Connect publish channel → approve one post → confirm **receipt**.  
7. If any step fails, note exact URL, message, and time—fix that step before new features.

---

## 6. After this sprint

Only when SC-01–SC-06 are green on production for a sustained period:

1. Voice (script → audio) as an extension of the pack  
2. Short video from the same script/template  
3. Lead ingest (form → score → list; no auto-spam)  

---

*End of speckit set*

## Response snapshot

Audited Phase A. Listed required AI env vars from the repo (AI_PROVIDER, AI_API_KEY, AI_MODEL; AI_BASE_URL only for openai-compatible). Confirmed Vercel project founder-ops serves lumo-ops.vercel.app and production runs 9e96da5. Vercel env listing returned 403 through MCP, so Production env state is unverified. Implemented T-A2/T-A3 in code: ProviderError now has a kind, 401/402/403 and missing or invalid settings are "config", and Start and Pack show a distinct logged configuration message. Not committed or deployed.

## Outcome

- ✅ Impact: Provider credential failures no longer read as "did not respond"; provider failures now reach runtime logs. Local only until deployed.
- 🧪 Tests: 7 new provider-error tests pass; tsc clean; 203 existing unit tests pass. No production run yet.
- 📁 Files: lib/ai/provider.ts, Start and Pack actions, tests/unit/provider-errors.test.ts.
- 🔁 Next prompts: Owner confirms Production AI env vars, approves commit and deploy, then T-A4 on production.
- 🧠 Reflection: Zero runtime errors in 7 days did not prove health, because provider failures were returned as form state without logging.

## Evaluation notes (flywheel)

- Failure modes observed: Vercel MCP 403 on env listing; project name differs from the product name.
- Graders run and results (PASS/FAIL): vitest PASS; tsc PASS; production dogfood NOT RUN.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Run T-A4 on production after deploy and compare the error text to the actual failure.
