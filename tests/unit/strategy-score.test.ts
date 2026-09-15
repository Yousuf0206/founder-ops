import { describe, expect, it } from "vitest";

import {
  flattenText,
  ideaSchema,
  keepEvidenced,
  priorityScore,
  rankIdeas,
  strategyOutputSchema,
  type Idea,
} from "@/lib/strategy/score";

/** 002 T1.6 — FR-S-001..003: scores on a 0–100 scale, every idea tied to real evidence. */

const research = flattenText({
  summary: "Parents want weekly progress reports.",
  opportunities: [{ title: "Progress visibility", findings: [{ statement: "12 of 20 parents asked for reports" }] }],
});

function idea(overrides: Partial<Idea> = {}): Idea {
  return ideaSchema.parse({
    title: "Weekly report campaign",
    impact: 80,
    effort: 40,
    confidence: 70,
    evidence: [{ source: "research", ref: "Progress visibility", quote: "12 of 20 parents asked for reports" }],
    ...overrides,
  });
}

describe("ideaSchema", () => {
  it("coerces and rounds scores, and rejects anything outside 0–100", () => {
    expect(ideaSchema.parse({ title: "x", impact: "85.6", effort: 10, confidence: 0 }).impact).toBe(86);
    expect(ideaSchema.safeParse({ title: "x", impact: 101, effort: 0, confidence: 0 }).success).toBe(false);
    expect(ideaSchema.safeParse({ title: "x", impact: -1, effort: 0, confidence: 0 }).success).toBe(false);
  });

  it("parses a full model response", () => {
    const parsed = strategyOutputSchema.parse({ ideas: [idea()] });
    expect(parsed.ideas).toHaveLength(1);
  });
});

describe("keepEvidenced", () => {
  it("keeps an idea whose quote appears in the source, ignoring case and spacing", () => {
    const kept = keepEvidenced(
      [idea({ evidence: [{ source: "research", ref: "r", quote: "12 OF 20   parents asked" }] })],
      { research },
    );
    expect(kept).toHaveLength(1);
  });

  it("drops an idea whose evidence was invented", () => {
    const kept = keepEvidenced(
      [idea({ evidence: [{ source: "research", ref: "r", quote: "90% of parents churn" }] })],
      { research },
    );
    expect(kept).toHaveLength(0);
  });

  it("drops an idea with no evidence at all", () => {
    expect(keepEvidenced([idea({ evidence: [] })], { research })).toHaveLength(0);
  });

  it("does not accept evidence from a source that was not supplied", () => {
    const kept = keepEvidenced(
      [idea({ evidence: [{ source: "analysis", ref: "r", quote: "12 of 20 parents" }] })],
      { research },
    );
    expect(kept).toHaveLength(0);
  });

  it("removes only the invented quotes from an idea that also has real ones", () => {
    const [kept] = keepEvidenced(
      [
        idea({
          evidence: [
            { source: "research", ref: "real", quote: "weekly progress reports" },
            { source: "research", ref: "fake", quote: "made up" },
          ],
        }),
      ],
      { research },
    );
    expect(kept!.evidence.map((e) => e.ref)).toEqual(["real"]);
  });
});

describe("priorityScore and rankIdeas", () => {
  it("weights impact by confidence and discounts effort", () => {
    expect(priorityScore({ impact: 100, effort: 0, confidence: 100 })).toBe(100);
    expect(priorityScore({ impact: 100, effort: 100, confidence: 100 })).toBe(50);
    expect(priorityScore({ impact: 80, effort: 40, confidence: 50 })).toBe(32);
  });

  it("sorts highest priority first without mutating the input", () => {
    const low = { impact: 20, effort: 90, confidence: 30 };
    const high = { impact: 90, effort: 10, confidence: 90 };
    const input = [low, high];
    expect(rankIdeas(input)).toEqual([high, low]);
    expect(input).toEqual([low, high]);
  });
});
