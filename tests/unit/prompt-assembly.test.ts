import { describe, expect, it } from "vitest";

import {
  assembleSystemPrompt,
  findForbiddenClaims,
  MissingClaimSetError,
  UNKNOWN_INSTRUCTION,
} from "@/lib/prompts/assemble";
import type { ClaimSet } from "@/lib/knowledge/repo";

/**
 * T2.9 — the test behind Constitution III.
 *
 * Prompt assembly is the only path to a provider, so if it cannot be built
 * without a claim set, no unbound prompt can exist.
 */

const claimSet: ClaimSet = {
  workspace_id: "ws-1",
  approved_claims: ["Covers the Punjab board syllabus", "Free tier available"],
  forbidden_claims: ["guaranteed admission", "100% pass rate"],
  brand_voice: "Plain and warm.",
  updated_at: "2026-09-11T00:00:00.000Z",
};

describe("assembleSystemPrompt", () => {
  it("throws when the claim set is missing", () => {
    expect(() => assembleSystemPrompt("Role", { claimSet: null })).toThrow(
      MissingClaimSetError,
    );
  });

  it("names the fix in the error message", () => {
    expect(() => assembleSystemPrompt("Role", { claimSet: null })).toThrow(
      /\/knowledge\/claims/,
    );
  });

  it("includes every approved claim", () => {
    const prompt = assembleSystemPrompt("Role", { claimSet });
    for (const claim of claimSet.approved_claims) {
      expect(prompt).toContain(claim);
    }
  });

  it("includes every forbidden claim", () => {
    const prompt = assembleSystemPrompt("Role", { claimSet });
    for (const claim of claimSet.forbidden_claims) {
      expect(prompt).toContain(claim);
    }
  });

  it("includes the brand voice", () => {
    expect(assembleSystemPrompt("Role", { claimSet })).toContain("Plain and warm.");
  });

  it("includes the standing unknown instruction", () => {
    expect(assembleSystemPrompt("Role", { claimSet })).toContain(UNKNOWN_INSTRUCTION);
  });

  it("includes the caller's role text", () => {
    expect(assembleSystemPrompt("You are a research analyst.", { claimSet })).toContain(
      "You are a research analyst.",
    );
  });

  it("forbids asserting any product fact when approved claims are empty", () => {
    const prompt = assembleSystemPrompt("Role", {
      claimSet: { ...claimSet, approved_claims: [] },
    });
    expect(prompt).toMatch(/may not assert ANY product fact/i);
  });

  it("builds with an empty claim set object, since empty is not missing", () => {
    expect(() =>
      assembleSystemPrompt("Role", {
        claimSet: { ...claimSet, approved_claims: [], forbidden_claims: [], brand_voice: "" },
      }),
    ).not.toThrow();
  });

  it("includes knowledge docs when supplied", () => {
    const prompt = assembleSystemPrompt("Role", {
      claimSet,
      docs: [{ title: "Pricing", category: "commercial", body: "Free tier is 10 lessons." }],
    });

    expect(prompt).toContain("Pricing");
    expect(prompt).toContain("Free tier is 10 lessons.");
  });

  it("instructs against implying or paraphrasing forbidden claims, not just stating them", () => {
    const prompt = assembleSystemPrompt("Role", { claimSet });
    expect(prompt).toMatch(/imply, paraphrase, or hint/i);
  });
});

describe("findForbiddenClaims", () => {
  it("finds a forbidden claim regardless of case", () => {
    expect(
      findForbiddenClaims("We offer Guaranteed Admission to top schools.", claimSet),
    ).toEqual(["guaranteed admission"]);
  });

  it("returns empty for clean output", () => {
    expect(findForbiddenClaims("We cover the Punjab board syllabus.", claimSet)).toEqual([]);
  });

  it("finds several at once", () => {
    const found = findForbiddenClaims(
      "guaranteed admission and a 100% pass rate",
      claimSet,
    );
    expect(found).toHaveLength(2);
  });

  it("ignores blank forbidden entries", () => {
    expect(findForbiddenClaims("anything", { ...claimSet, forbidden_claims: ["", "  "] })).toEqual(
      [],
    );
  });
});
