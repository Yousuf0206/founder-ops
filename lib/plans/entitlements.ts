import { z } from "zod";

/**
 * Plan entitlements (decisions §6). Config, not billing.
 *
 * The database enforces these through `plan_limits()` in
 * supabase/migrations/0008_plans_and_settings.sql; this module mirrors them for
 * display and early, readable refusals. Change both together.
 */

export const PLAN_TIERS = ["solo", "team", "business"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PUBLISH_MODES = ["draft_only", "approve_then_publish", "auto_within_rules"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

/** Decisions §4: the safer default for new workspaces. */
export const DEFAULT_PUBLISH_MODE: PublishMode = "approve_then_publish";

export type PlanLimits = {
  maxWorkspaces: number;
  maxSeats: number;
  dailyAiRuns: number;
  dailyPublishes: number;
  autoAllowed: boolean;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  solo: { maxWorkspaces: 1, maxSeats: 3, dailyAiRuns: 50, dailyPublishes: 5, autoAllowed: false },
  team: { maxWorkspaces: 5, maxSeats: 15, dailyAiRuns: 150, dailyPublishes: 15, autoAllowed: true },
  business: {
    maxWorkspaces: 20,
    maxSeats: 50,
    dailyAiRuns: 500,
    dailyPublishes: 50,
    autoAllowed: true,
  },
};

/** Decisions §5 clamp. FR-Q-109 is open: until decided, min(30, plan limit). */
export const PUBLISH_CAP_CLAMP = 30;

export function publishCapCeiling(plan: PlanTier): number {
  return Math.min(PUBLISH_CAP_CLAMP, PLAN_LIMITS[plan].dailyPublishes);
}

export function canUseAutoMode(plan: PlanTier): boolean {
  return PLAN_LIMITS[plan].autoAllowed;
}

export const planTierSchema = z.enum(PLAN_TIERS);
export const publishModeSchema = z.enum(PUBLISH_MODES);

/**
 * The plan new self-serve workspaces receive. Unset means `solo`; a set but
 * invalid value throws, so a typo cannot silently hand out the wrong plan.
 */
export function defaultPlan(env: Record<string, string | undefined> = process.env): PlanTier {
  const raw = env.DEFAULT_PLAN?.trim();
  if (!raw) return "solo";
  const parsed = planTierSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`DEFAULT_PLAN must be one of ${PLAN_TIERS.join(", ")} (got "${raw}").`);
  }
  return parsed.data;
}
