# ADR-0001: Membership and Workspace Creation

- **Status:** Accepted
- **Date:** 2026-09-11
- **Feature:** 001-lumo-ops-core
- **Context:** Constitution VI requires multi-workspace support in the data model from day
  one, and Constitution V requires the product to be team-only with RLS. Spec v1.0 named
  three roles and a `Membership` entity but specified no way for a second person to obtain
  a membership, and no rule for who may create a workspace (FR-Q-006, FR-Q-007). Both
  questions had to be answered before the first migration, because each changes the
  schema rather than the code above it.

## Decision

Membership and workspace creation are treated as one decision cluster, resolved as
follows and enforced in the database rather than in application code.

**Workspace creation is a seed/admin action.**
- `workspaces` has **no INSERT policy** for the `authenticated` role. There is no code
  path by which a signed-in user creates a tenant.
- Creation happens through `npm run seed:workspace -- --name … --slug … --owner …`, which
  uses the service-role key and therefore bypasses RLS by design.
- The script is idempotent on `slug`: re-running updates the name and ensures the owner
  membership rather than creating a duplicate.

**Membership is obtained by invitation, or by the seed script.**
- `invitations` (`workspace_id`, `email`, `role`, `token`, `invited_by`, `expires_at`,
  `accepted_at`, `accepted_by`) is owner-only to create and to revoke.
- A partial unique index on `(workspace_id, lower(email)) where accepted_at is null`
  prevents duplicate live invitations to the same address.
- Redemption goes through `accept_invitation(token)`, a `SECURITY DEFINER` function, at
  `/invite/[token]`. It verifies the token exists, is unaccepted, is unexpired, and is
  addressed to the caller's own email before inserting the membership.

**Supporting mechanisms.**
- `is_member`, `has_role`, `can_write`, `is_owner` are `SECURITY DEFINER` helpers so that
  policies on `memberships` can consult membership without recursing into their own RLS
  check.
- `force row level security` is set on all four Phase 0 tables, so even a table owner
  connecting directly is subject to the policies.
- A trigger on `auth.users` creates the `profiles` row on signup, which is what the seed
  script and the invitation flow both key off.

## Consequences

### Positive

- **Tenant creation is not an attack surface.** Absent an INSERT policy, no request —
  malformed, authorized, or hostile — can create a workspace. The property holds without
  any route needing to remember to check.
- **The invitee problem is solved without weakening isolation.** An invited person cannot
  see the workspace they are being invited to, which is correct; `SECURITY DEFINER` on the
  single redemption function is the narrow exception, and it re-checks email ownership
  inside the function.
- **Invitations are auditable.** Who invited whom, at what role, when it expired, and
  whether it was accepted are all rows, satisfying Constitution VII without extra work.
- **SC-001 is satisfiable.** A second workspace is a seed row, not a code change.
- **Roles become testable with real users**, which the seed-only alternative would not
  have allowed.

### Negative

- **Onboarding has a manual step.** Someone with database or CLI access must run the seed
  script for each new tenant. Acceptable at two workspaces; friction if Founder Ops ever
  serves many.
- **The invitee must sign in before redeeming.** `accept_invitation()` reads
  `auth.uid()`, so the flow is sign-in-then-redeem, not one click. `/invite/[token]`
  redirects through `/login?next=…` to hide this, but it is still two steps.
- **`SECURITY DEFINER` is a standing audit target.** Five functions run with elevated
  rights. Each is small and re-checks authorization internally, but any future edit to
  them is security-relevant and must be reviewed as such.
- **Email identity is assumed stable.** Redemption matches on `lower(email)`. If a user
  changes their address between invitation and acceptance, the invite becomes unusable
  and must be reissued.
- **No self-serve path exists if the product direction changes.** Adding one later means a
  new policy and a new route — small, but a deliberate reversal rather than a toggle.

## Alternatives Considered

**A. Owner adds an existing user by email (no invitations table).**
The owner types an address; if a matching profile exists, a membership row is created
immediately. Simplest possible schema.
*Rejected because* it only works for people who already have accounts, and Founder Ops has
no other signup route — so the first teammate could never be added. It also leaves no
record of who invited whom.

**B. Supabase Auth's built-in invite (`inviteUserByEmail`) with a trigger.**
Least code: Supabase sends the magic link, a trigger creates the membership on first
login.
*Rejected because* it ties the join flow to Supabase-specific admin APIs, gives a thinner
audit trail than a first-class `invitations` row, and makes the role assignment awkward to
carry through the magic-link round trip.

**C. Defer entirely — seed-only memberships, single-user v1.**
No join path at all; every membership comes from the seed script.
*Rejected because* the Owner/Editor/Viewer roles in the spec would be untestable with real
users, and US1 acceptance scenario 5 (a viewer's write is rejected) could not be
demonstrated. It also pushes a schema decision into a later phase, when the migration is
harder to change.

**D. Any authenticated user may create a workspace.**
Self-serve tenants, owner assigned on creation.
*Rejected because* Founder Ops is an internal team-only tool (Constitution V). Self-serve
creation means anyone who can authenticate can spin up tenants, which widens the surface
for no benefit at this scale.

**On the cap, decided alongside:** run-count (50/day, UTC reset, owner-editable) over a
token/cost budget, because token counts are only known after a call returns — a spend cap
necessarily overshoots on the run that crosses it, while a run cap can be enforced
transactionally before the provider is called. Recorded here because it landed in the same
migration (`workspaces.daily_run_cap`); the enforcement mechanism is Phase 2 and may
warrant its own ADR.

## References

- Feature Spec: [specs/001-lumo-ops-core/spec.md](../../specs/001-lumo-ops-core/spec.md) — FR-Q-002, FR-Q-006, FR-Q-007 under Resolved Clarifications
- Implementation Plan: [specs/001-lumo-ops-core/plan.md](../../specs/001-lumo-ops-core/plan.md) — Constitution Check rows V, VI, VIII
- Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) — principles V, VI, VII, VIII
- Migration: [supabase/migrations/0001_foundation.sql](../../supabase/migrations/0001_foundation.sql)
- Tests: [tests/integration/rls-foundation.test.ts](../../tests/integration/rls-foundation.test.ts) — 13 cases, **written but not yet executed**
- Evaluator Evidence: [history/prompts/001-lumo-ops-core/0005-phase-zero-foundation.green.prompt.md](../prompts/001-lumo-ops-core/0005-phase-zero-foundation.green.prompt.md)
- Related ADRs: none
