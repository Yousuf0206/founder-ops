import { describe, expect, it } from "vitest";

import { LIVE_PUBLISH_PLATFORMS } from "@/lib/connectors/registry";
import {
  growthPackSchema,
  isPublishablePlatform,
  packPostSchema,
  toDraftPayload,
  MIN_PACK_POSTS,
  PACK_PLATFORMS,
  type PackPost,
} from "@/lib/growth/pack";

/**
 * Phase B — the Growth pack (work order P2).
 *
 * The pack's guardrails are not new ones. They are the ops loop's guardrails,
 * reached by writing pack posts into content_drafts rather than into a table of
 * their own. These tests pin the two places that could still drift: the shape
 * the model must produce, and the rule that decides what may ever publish.
 */

function post(overrides: Partial<PackPost> = {}): PackPost {
  return {
    platform: "linkedin",
    angle: "Show the work, not the promise",
    topic: "What nine formats actually look like",
    hook: "We rebuilt the study set from scratch.",
    script: "Here is what came out, and what it still cannot do.",
    cta: "Try it on one lecture.",
    hashtags: ["#edtech"],
    ...overrides,
  };
}

describe("isPublishablePlatform — the Meta gate", () => {
  it("lets LinkedIn through, because it has a live connector", () => {
    expect(isPublishablePlatform("linkedin")).toBe(true);
  });

  it("holds Instagram back until Meta is live", () => {
    expect(isPublishablePlatform("instagram")).toBe(false);
  });

  /**
   * The gate is deliberately NOT a constant of its own. If a second list of
   * publishable platforms existed, one of the two would eventually be wrong,
   * and the wrong one would be the one deciding whether a post goes out.
   */
  it("is the connector registry itself, not a copy of it", () => {
    for (const platform of PACK_PLATFORMS) {
      expect(isPublishablePlatform(platform)).toBe(
        (LIVE_PUBLISH_PLATFORMS as readonly string[]).includes(platform),
      );
    }
  });

  it("holds back a platform the pack does not even write for", () => {
    expect(isPublishablePlatform("tiktok")).toBe(false);
  });
});

describe("growthPackSchema", () => {
  const angles = [{ angle: "Show the work", hurdle: "No proof", rationale: "Because." }];

  it("refuses a pack with fewer than five posts", () => {
    const result = growthPackSchema.safeParse({
      angles,
      posts: Array.from({ length: MIN_PACK_POSTS - 1 }, () => post()),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a pack with exactly five", () => {
    const result = growthPackSchema.safeParse({
      angles,
      posts: Array.from({ length: MIN_PACK_POSTS }, () => post()),
    });
    expect(result.success).toBe(true);
  });

  it("refuses a platform the pack has no brief for", () => {
    // A post for a platform we never described would be written blind.
    expect(packPostSchema.safeParse(post({ platform: "tiktok" as never })).success).toBe(false);
  });

  it("refuses a post with no topic — it would file as an unnamed draft", () => {
    expect(packPostSchema.safeParse(post({ topic: "" })).success).toBe(false);
  });

  it("fills absent optional fields rather than refusing", () => {
    const result = packPostSchema.safeParse({ platform: "instagram", topic: "A topic" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hashtags).toEqual([]);
      expect(result.data.script).toBe("");
    }
  });

  it("refuses a pack with no angles — the posts would come from nowhere", () => {
    const result = growthPackSchema.safeParse({
      angles: [],
      posts: Array.from({ length: MIN_PACK_POSTS }, () => post()),
    });
    expect(result.success).toBe(false);
  });
});

describe("toDraftPayload", () => {
  it("produces the payload shape content_drafts already stores", () => {
    const payload = toDraftPayload(post());

    // These are the keys lib/ai/content.ts writes, so one draft renderer serves
    // both the ops loop and the pack.
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining([
        "hook",
        "script",
        "captions",
        "titles",
        "hashtags",
        "cta",
        "visual_plan",
      ]),
    );
  });

  it("carries the angle through, so the pack screen can group by it", () => {
    expect(toDraftPayload(post()).angle).toBe("Show the work, not the promise");
  });

  it("keeps the post's own text verbatim", () => {
    const original = post({ script: "Line one.\nLine two." });
    expect(toDraftPayload(original).script).toBe("Line one.\nLine two.");
  });
});
