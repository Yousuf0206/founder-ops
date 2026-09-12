import { describe, expect, it } from "vitest";

import { HIGH_INTENT_THRESHOLD, hashSecret, leadPayloadSchema } from "@/lib/leads/ingest";

/** T4.6 boundary half, plus the secret hashing. Runs without a database. */

describe("leadPayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = leadPayloadSchema.parse({ email: "a@example.com" });
    expect(result.email).toBe("a@example.com");
    expect(result.source).toBe("webhook");
    expect(result.message).toBe("");
  });

  it("rejects a malformed email", () => {
    expect(leadPayloadSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(leadPayloadSchema.safeParse({ message: "hi" }).success).toBe(false);
  });

  it("trims the email", () => {
    expect(leadPayloadSchema.parse({ email: "  a@example.com  " }).email).toBe(
      "a@example.com",
    );
  });

  it("rejects an oversized message", () => {
    const result = leadPayloadSchema.safeParse({
      email: "a@example.com",
      message: "x".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });

  it("ignores unknown fields rather than failing the webhook", () => {
    const result = leadPayloadSchema.safeParse({
      email: "a@example.com",
      utm_campaign: "spring",
    });
    expect(result.success).toBe(true);
  });
});

describe("hashSecret", () => {
  it("is deterministic", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
  });

  it("differs for different secrets", () => {
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });

  it("returns a 64-character hex digest", () => {
    expect(hashSecret("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the secret itself", () => {
    expect(hashSecret("super-secret")).not.toContain("super-secret");
  });
});

describe("high-intent threshold", () => {
  it("is 70, matching the FR-Q-003 assumption recorded in spec.md", () => {
    expect(HIGH_INTENT_THRESHOLD).toBe(70);
  });
});
