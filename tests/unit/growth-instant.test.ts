import { describe, expect, it } from "vitest";

import {
  findGlobalForbidden,
  GLOBAL_FORBIDDEN_PROMPT_BLOCK,
} from "@/lib/claims/forbidden-patterns";
import {
  dropForbiddenHurdles,
  growthAnalysisSchema,
  hurdleSchema,
  type Hurdle,
} from "@/lib/growth/analyze";
import { nameFromUrl, slugFromUrl } from "@/lib/growth/workspace";
import { assembleSystemPrompt, hasProductFacts, MissingClaimSetError } from "@/lib/prompts/assemble";
import type { ProductFacts } from "@/lib/facts/repo";
import type { ClaimSet } from "@/lib/knowledge/repo";

/**
 * Phase A of Growth Instant (T-A4, T-A7, T-A8; FR-GI-X-003/004, FR-GI-S-003).
 *
 * The claim wall came down for a first run. These are the tests that say what
 * replaced it — not "nothing".
 */

const facts: ProductFacts = {
  workspace_id: "ws-1",
  product_name: "Lumo Learn",
  tagline: "Board-syllabus practice for Punjab students",
  features: [{ feature: "Past-paper practice", evidence: "Practise every past paper" }],
  primary_cta: "Start free",
  pricing_signals: ["Free tier"],
  unknowns: ["Number of users"],
  source_url: "https://lumo-learn.com",
  source_analyze_run_id: null,
  confirmed_at: null,
  updated_by: null,
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z",
};

const emptyFacts: ProductFacts = {
  ...facts,
  product_name: "",
  tagline: "  ",
  features: [],
};

function hurdle(overrides: Partial<Hurdle> = {}): Hurdle {
  return {
    title: "No clear call to action",
    explanation: "The home page ends without asking the visitor to do anything.",
    why_it_hurts: "Interested visitors leave with nowhere to go.",
    suggested_fix: "Put one button above the fold.",
    content_actions: ["Post about the new sign-up flow"],
    ...overrides,
  };
}

describe("hasProductFacts", () => {
  it("binds a prompt when the extraction learned something", () => {
    expect(hasProductFacts(facts)).toBe(true);
  });

  it("does not bind on a row of empty strings — extraction found nothing", () => {
    expect(hasProductFacts(emptyFacts)).toBe(false);
    expect(hasProductFacts(null)).toBe(false);
  });
});

describe("assembleSystemPrompt without a claim set (T-A7)", () => {
  it("builds a bound prompt from product facts alone — SC-02", () => {
    const prompt = assembleSystemPrompt("Role", { claimSet: null, productFacts: facts });

    expect(prompt).toContain("Product facts (auto-extracted)");
    expect(prompt).toContain("Lumo Learn");
    // FR-GI-X-005: unknowns travel with the facts, so they can be said aloud.
    expect(prompt).toContain("Number of users");
    expect(prompt).toContain("NOT yet confirmed by a human");
  });

  it("still refuses when neither claims nor facts exist", () => {
    expect(() => assembleSystemPrompt("Role", { claimSet: null, productFacts: emptyFacts })).toThrow(
      MissingClaimSetError,
    );
    expect(() => assembleSystemPrompt("Role", { claimSet: null })).toThrow(MissingClaimSetError);
  });

  it("injects the global forbidden floor on a claim-less prompt", () => {
    const prompt = assembleSystemPrompt("Role", { claimSet: null, productFacts: facts });
    expect(prompt).toContain(GLOBAL_FORBIDDEN_PROMPT_BLOCK);
  });

  it("injects the same floor when a claim set IS present", () => {
    const claimSet: ClaimSet = {
      workspace_id: "ws-1",
      approved_claims: ["Covers the Punjab board syllabus"],
      forbidden_claims: [],
      brand_voice: "Plain.",
      updated_at: "2026-09-17T00:00:00.000Z",
    };
    expect(assembleSystemPrompt("Role", { claimSet })).toContain(GLOBAL_FORBIDDEN_PROMPT_BLOCK);
  });
});

/**
 * The bootstrap deadlock (P0).
 *
 * Every other generation in the product must be bound to approved claims or to
 * stored product facts. The analysis that CREATES those facts cannot be — and
 * requiring it to be made a first run impossible: the gate refused, and Start
 * reported the refusal as "we could not read enough from that page", so the
 * founder went off to fix a page that had been read perfectly well.
 *
 * These tests pin both halves: the exemption exists, and it stays exactly one
 * run wide.
 */
describe("the bootstrap exemption (SC-02)", () => {
  it("builds a prompt with neither claims nor facts when allowUnbound is set", () => {
    const prompt = assembleSystemPrompt("Role", {
      claimSet: null,
      productFacts: null,
      allowUnbound: true,
    });

    expect(prompt).toContain("Role");
    // Exempt from the gate is not exempt from the floor.
    expect(prompt).toContain(GLOBAL_FORBIDDEN_PROMPT_BLOCK);
    // And it is still told it may assert nothing about the product itself.
    expect(prompt).toContain("You may not assert ANY product fact");
  });

  it("is exempt from the empty-approved-claims refusal too", () => {
    // The shape a real first-run workspace has if a claim_sets row was seeded
    // empty: present, but with nothing approved in it.
    const emptyClaimSet: ClaimSet = {
      workspace_id: "ws-1",
      approved_claims: [],
      forbidden_claims: [],
      brand_voice: "",
      updated_at: "2026-09-17T00:00:00.000Z",
    };

    expect(() => assembleSystemPrompt("Role", { claimSet: emptyClaimSet })).toThrow(
      MissingClaimSetError,
    );
    expect(() =>
      assembleSystemPrompt("Role", { claimSet: emptyClaimSet, allowUnbound: true }),
    ).not.toThrow();
  });

  it("defaults to off — the gate still binds every ordinary run", () => {
    expect(() => assembleSystemPrompt("Role", { claimSet: null })).toThrow(MissingClaimSetError);
    expect(() =>
      assembleSystemPrompt("Role", { claimSet: null, allowUnbound: false }),
    ).toThrow(MissingClaimSetError);
  });

  it("still injects real facts when the bootstrap run is a RE-analysis", () => {
    // Second run for an established workspace: the exemption is set, but the
    // facts that exist must still bind, not be ignored because it was set.
    const prompt = assembleSystemPrompt("Role", {
      claimSet: null,
      productFacts: facts,
      allowUnbound: true,
    });
    expect(prompt).toContain("Product facts (auto-extracted)");
    expect(prompt).toContain("Lumo Learn");
  });
});

describe("findGlobalForbidden (T-A8)", () => {
  it.each([
    ["we guarantee results in 30 days", "guaranteed-outcome"],
    ["the #1 tutoring app in Pakistan", "invented-rank"],
    ["our certified instructors", "false-certification"],
    ["risk-free for 30 days", "risk-free"],
  ])("catches %j", (text, id) => {
    expect(findGlobalForbidden(text).map((hit) => hit.id)).toContain(id);
  });

  it("leaves honest copy alone", () => {
    expect(findGlobalForbidden("Practise past papers and track your weak topics.")).toEqual([]);
  });

  it("does not fire on 'no. 10' via the 'no. 1' pattern", () => {
    expect(findGlobalForbidden("See no. 10 on the syllabus list.")).toEqual([]);
  });

  it("returns the matched text for the audit trail", () => {
    const [hit] = findGlobalForbidden("Completely risk-free.");
    expect(hit!.match.toLowerCase()).toBe("risk-free");
  });
});

describe("dropForbiddenHurdles (FR-GI-X-003)", () => {
  it("keeps clean hurdles untouched", () => {
    const { kept, dropped } = dropForbiddenHurdles([hurdle(), hurdle({ title: "No pricing" })]);
    expect(kept).toHaveLength(2);
    expect(dropped).toEqual([]);
  });

  it("drops a hurdle whose violation hides in a content action", () => {
    const bad = hurdle({ content_actions: ["Post that results are guaranteed"] });
    const { kept, dropped } = dropForbiddenHurdles([hurdle(), bad]);

    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.hits.map((hit) => hit.id)).toContain("guaranteed-outcome");
  });

  it("reports an empty keep list rather than passing violations through", () => {
    const { kept, dropped } = dropForbiddenHurdles([hurdle({ title: "Be the #1 app" })]);
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
  });
});

describe("growthAnalysisSchema (FR-GI-H-001/002)", () => {
  const facts_ = { product_name: "Lumo", tagline: "", features: [], primary_cta: "" };

  it("refuses fewer than three hurdles", () => {
    const result = growthAnalysisSchema.safeParse({
      product_facts: facts_,
      hurdles: [hurdle(), hurdle()],
    });
    expect(result.success).toBe(false);
  });

  it("accepts three and fills absent optional fields", () => {
    const result = growthAnalysisSchema.safeParse({
      product_facts: facts_,
      hurdles: [{ title: "a" }, { title: "b" }, { title: "c" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hurdles[0]!.content_actions).toEqual([]);
      expect(result.data.product_facts.unknowns).toEqual([]);
    }
  });

  it("refuses a hurdle with no title", () => {
    expect(hurdleSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("silent workspace naming (FR-GI-S-003)", () => {
  it("derives a slug from the host and salts it against collisions", () => {
    expect(slugFromUrl("https://Lumo-Learn.com/pricing", "abcdef123456")).toBe(
      "lumo-learn-com-abcdef",
    );
  });

  it("drops www and keeps the host as the display name", () => {
    expect(nameFromUrl("https://www.lumo-learn.com/x")).toBe("lumo-learn.com");
  });

  it("falls back rather than throwing on an unparseable URL", () => {
    expect(slugFromUrl("not a url", "abcdef")).toMatch(/^workspace-|^not-|-abcdef$/);
    expect(nameFromUrl("not a url")).toBe("My workspace");
  });
});
