import { describe, expect, it } from "vitest";

import {
  canUseAutoMode,
  DEFAULT_PUBLISH_MODE,
  defaultPlan,
  PLAN_LIMITS,
  publishCapCeiling,
} from "@/lib/plans/entitlements";

/** T0.10 — plan entitlements, decisions §4–§6. */

describe("plan entitlements", () => {
  it("matches the decisions §6 table", () => {
    expect(PLAN_LIMITS.solo).toEqual({
      maxWorkspaces: 1,
      maxSeats: 3,
      dailyAiRuns: 50,
      dailyPublishes: 5,
      autoAllowed: false,
    });
    expect(PLAN_LIMITS.team.dailyPublishes).toBe(15);
    expect(PLAN_LIMITS.business.maxWorkspaces).toBe(20);
  });

  it("allows auto mode only on team and business", () => {
    expect(canUseAutoMode("solo")).toBe(false);
    expect(canUseAutoMode("team")).toBe(true);
    expect(canUseAutoMode("business")).toBe(true);
  });

  it("clamps the publish cap ceiling to min(30, plan limit) pending FR-Q-109", () => {
    expect(publishCapCeiling("solo")).toBe(5);
    expect(publishCapCeiling("team")).toBe(15);
    expect(publishCapCeiling("business")).toBe(30);
  });

  it("defaults new workspaces to approve_then_publish", () => {
    expect(DEFAULT_PUBLISH_MODE).toBe("approve_then_publish");
  });
});

describe("defaultPlan", () => {
  it("is solo when DEFAULT_PLAN is unset or blank", () => {
    expect(defaultPlan({})).toBe("solo");
    expect(defaultPlan({ DEFAULT_PLAN: "  " })).toBe("solo");
  });

  it("reads a valid DEFAULT_PLAN", () => {
    expect(defaultPlan({ DEFAULT_PLAN: "team" })).toBe("team");
  });

  it("throws on an invalid DEFAULT_PLAN rather than guessing", () => {
    expect(() => defaultPlan({ DEFAULT_PLAN: "enterprise" })).toThrow(/DEFAULT_PLAN/);
  });
});
