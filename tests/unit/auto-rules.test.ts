import { describe, expect, it } from "vitest";

import {
  evaluateAutoRules,
  localClock,
  withinWindow,
  type AutoCandidate,
  type AutoSettings,
} from "@/lib/publish/rules";

/** 002 T3.3 — US5 AC1–AC12: the fixed auto-within-rules gates. */

// Wednesday 2026-09-16 12:00 UTC — inside the default Mon–Sat 09:00–20:00 window in UTC.
const WEDNESDAY_NOON_UTC = new Date("2026-09-16T12:00:00Z");

const settings: AutoSettings = {
  plan: "team",
  publishMode: "auto_within_rules",
  autoEnabled: true,
  timezone: "UTC",
  windowStart: "09:00",
  windowEnd: "20:00",
  days: [1, 2, 3, 4, 5, 6],
  minConfidence: null,
};

const candidate: AutoCandidate = {
  targetType: "content_draft",
  accountActive: true,
  accountAutoEnabled: true,
  hasApprovedClaims: true,
  forbiddenViolations: [],
  ideaConfidence: null,
};

function decide(s: Partial<AutoSettings> = {}, c: Partial<AutoCandidate> = {}, now = WEDNESDAY_NOON_UTC) {
  return evaluateAutoRules({ ...settings, ...s }, { ...candidate, ...c }, now);
}

describe("evaluateAutoRules", () => {
  it("publishes a draft that satisfies every rule (AC1)", () => {
    expect(decide()).toEqual({ publish: true });
  });

  it("routes a forbidden claim to human review rather than publishing (AC2)", () => {
    const result = decide({}, { forbiddenViolations: ["guaranteed admission"] });
    expect(result).toMatchObject({ publish: false, routeToReview: true });
  });

  it("holds when the account is not connected or its token is invalid (AC5)", () => {
    expect(decide({}, { accountActive: false })).toMatchObject({ publish: false, routeToReview: false });
  });

  it("holds when the master toggle is off (AC7)", () => {
    expect(decide({ autoEnabled: false })).toMatchObject({ publish: false });
  });

  it("holds for an account not enabled for auto (AC8)", () => {
    expect(decide({}, { accountAutoEnabled: false })).toMatchObject({ publish: false });
  });

  it("holds outside the window and on excluded days (AC9)", () => {
    expect(decide({}, {}, new Date("2026-09-16T21:00:00Z"))).toMatchObject({ publish: false });
    // Sunday 2026-09-20, noon — Sunday is not in Mon–Sat.
    expect(decide({}, {}, new Date("2026-09-20T12:00:00Z"))).toMatchObject({ publish: false });
  });

  it("holds anything that is not a content draft (AC10)", () => {
    expect(decide({}, { targetType: "campaign" })).toMatchObject({ publish: false });
  });

  it("applies the confidence gate only when it is on (AC11)", () => {
    expect(decide({ minConfidence: null }, { ideaConfidence: 10 })).toEqual({ publish: true });
    expect(decide({ minConfidence: 60 }, { ideaConfidence: 59 })).toMatchObject({ publish: false });
    expect(decide({ minConfidence: 60 }, { ideaConfidence: null })).toMatchObject({ publish: false });
    expect(decide({ minConfidence: 60 }, { ideaConfidence: 60 })).toEqual({ publish: true });
  });

  it("holds when the workspace has no approved claims (AC12)", () => {
    expect(decide({}, { hasApprovedClaims: false })).toMatchObject({ publish: false });
  });

  it("holds unless the workspace is in auto mode on a plan that allows it", () => {
    expect(decide({ publishMode: "approve_then_publish" })).toMatchObject({ publish: false });
    expect(decide({ plan: "solo" })).toMatchObject({ publish: false });
  });
});

describe("window arithmetic", () => {
  it("reads the local weekday and time in the workspace timezone", () => {
    // 12:00 UTC is 17:00 in Karachi (UTC+5), still Wednesday.
    expect(localClock(WEDNESDAY_NOON_UTC, "Asia/Karachi")).toEqual({ isoDay: 3, minutes: 17 * 60 });
  });

  it("uses the workspace timezone, not UTC, for the window", () => {
    // 22:00 UTC Wednesday is 08:00 Thursday in Sydney (UTC+10): before a 09:00 opening.
    const lateUtc = new Date("2026-09-16T22:00:00Z");
    expect(withinWindow({ ...settings, timezone: "Australia/Sydney" }, lateUtc)).toBe(false);
    expect(withinWindow({ ...settings, timezone: "Australia/Sydney" }, new Date("2026-09-16T23:30:00Z"))).toBe(true);
  });

  it("treats the window end as exclusive", () => {
    expect(withinWindow(settings, new Date("2026-09-16T20:00:00Z"))).toBe(false);
    expect(withinWindow(settings, new Date("2026-09-16T09:00:00Z"))).toBe(true);
  });
});
