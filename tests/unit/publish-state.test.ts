import { describe, expect, it } from "vitest";

import {
  canCancel,
  canRetry,
  canTransition,
  isTerminal,
  PUBLISH_JOB_STATUSES,
  TRANSITIONS,
} from "@/lib/publish/state";

/** 002 T2.6 — FR-P-008: the publish job state machine. */

describe("publish job state machine", () => {
  it("defines transitions for every status", () => {
    for (const status of PUBLISH_JOB_STATUSES) expect(TRANSITIONS[status]).toBeDefined();
  });

  it("never leaves published or cancelled", () => {
    expect(isTerminal("published")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    for (const to of PUBLISH_JOB_STATUSES) {
      expect(canTransition("published", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("reaches published only from an attempt or a stored receipt, never from a failure", () => {
    const into = PUBLISH_JOB_STATUSES.filter((from) => canTransition(from, "published"));
    expect(into.sort()).toEqual(["publishing", "queued", "scheduled"]);
    expect(canTransition("failed", "published")).toBe(false);
    expect(canTransition("blocked", "published")).toBe(false);
  });

  it("retries only failed or blocked jobs", () => {
    expect(PUBLISH_JOB_STATUSES.filter(canRetry).sort()).toEqual(["blocked", "failed"]);
  });

  it("cannot cancel a job mid-attempt or after it published", () => {
    expect(canCancel("publishing")).toBe(false);
    expect(canCancel("published")).toBe(false);
    expect(canCancel("scheduled")).toBe(true);
  });

  it("an in-flight attempt can only finish", () => {
    expect([...TRANSITIONS.publishing].sort()).toEqual(["failed", "published"]);
  });
});
