import { describe, expect, it } from "vitest";

import {
  claimSetUpdateSchema,
  knowledgeDocCreateSchema,
  knowledgeDocUpdateSchema,
  linesToClaims,
} from "@/lib/validation/knowledge";

/**
 * Boundary validation (T1.6). These run without a database, so unlike the RLS
 * suite they actually execute in CI today.
 */

describe("knowledgeDocCreateSchema", () => {
  it("trims the title and applies defaults", () => {
    const result = knowledgeDocCreateSchema.parse({ title: "  Pricing  " });

    expect(result.title).toBe("Pricing");
    expect(result.body).toBe("");
    expect(result.category).toBe("general");
    expect(result.last_verified_at).toBeNull();
  });

  it("rejects a title that is only whitespace", () => {
    expect(knowledgeDocCreateSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(knowledgeDocCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    expect(
      knowledgeDocCreateSchema.safeParse({ title: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    const result = knowledgeDocCreateSchema.safeParse({
      title: "Doc",
      last_verified_at: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an ISO timestamp with offset", () => {
    const result = knowledgeDocCreateSchema.parse({
      title: "Doc",
      last_verified_at: "2026-09-11T10:00:00.000Z",
    });
    expect(result.last_verified_at).toBe("2026-09-11T10:00:00.000Z");
  });
});

describe("knowledgeDocUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(knowledgeDocUpdateSchema.parse({ body: "new body" }).body).toBe("new body");
  });

  it("rejects an empty update", () => {
    expect(knowledgeDocUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("claimSetUpdateSchema", () => {
  it("drops blank entries rather than failing", () => {
    const result = claimSetUpdateSchema.parse({
      approved_claims: ["Covers the Punjab board syllabus", "   ", ""],
      forbidden_claims: [],
      brand_voice: "",
    });

    expect(result.approved_claims).toEqual(["Covers the Punjab board syllabus"]);
  });

  it("trims each claim", () => {
    const result = claimSetUpdateSchema.parse({
      approved_claims: ["  spaced claim  "],
      forbidden_claims: [],
      brand_voice: "",
    });

    expect(result.approved_claims).toEqual(["spaced claim"]);
  });

  it("defaults every field", () => {
    const result = claimSetUpdateSchema.parse({});
    expect(result).toEqual({
      approved_claims: [],
      forbidden_claims: [],
      brand_voice: "",
    });
  });

  it("rejects a claim over 500 characters", () => {
    const result = claimSetUpdateSchema.safeParse({
      approved_claims: ["x".repeat(501)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 claims", () => {
    const result = claimSetUpdateSchema.safeParse({
      approved_claims: Array.from({ length: 201 }, (_, i) => `claim ${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("linesToClaims", () => {
  it("splits a textarea into one claim per non-empty line", () => {
    expect(linesToClaims("first\n\n  second  \n\n")).toEqual(["first", "second"]);
  });

  it("returns an empty array for empty input", () => {
    expect(linesToClaims("")).toEqual([]);
    expect(linesToClaims("\n\n  \n")).toEqual([]);
  });
});
