import { describe, expect, it } from "vitest";

import {
  MIN_PACK_POSTS,
  normalizePost,
  parsePackOutput,
  UnparseablePackError,
  type PackPost,
} from "@/lib/growth/pack";

/**
 * Reading a pack out of model output (005 D-1, D-4).
 *
 * The strict reader these tests replaced threw away an entire pack over one
 * malformed post, and did exactly that on production on 2026-11-15 — the
 * identical retry seconds later succeeded. A model is non-deterministic at the
 * edges of a shape, so the reader's job is to keep what is usable and fail only
 * when what survives is not a pack.
 *
 * The failure reasons are tested as carefully as the successes: a founder sees
 * one sentence either way, and the reason is the only thing that makes the next
 * production failure diagnosable.
 */

function post(overrides: Partial<PackPost> = {}): PackPost {
  return {
    platform: "linkedin",
    angle: "Show the work",
    topic: "What nine formats look like",
    hook: "We rebuilt the study set.",
    script: "Here is what came out.",
    cta: "Try it on one lecture.",
    hashtags: ["#edtech"],
    ...overrides,
  };
}

const angles = [{ angle: "Show the work", hurdle: "No proof", rationale: "Because." }];

const output = (posts: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ angles, posts, ...extra });

describe("parsePackOutput — what survives", () => {
  it("reads a well-formed pack unchanged", () => {
    const { pack, dropped } = parsePackOutput(output(Array.from({ length: 6 }, () => post())));

    expect(pack.posts).toHaveLength(6);
    expect(pack.angles).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("drops one malformed post rather than the whole pack", () => {
    const posts: unknown[] = [
      ...Array.from({ length: MIN_PACK_POSTS }, () => post()),
      { platform: "linkedin" },
    ];
    const { pack, dropped } = parsePackOutput(output(posts));

    expect(pack.posts).toHaveLength(MIN_PACK_POSTS);
    expect(dropped).toBe(1);
  });

  it("trims a surplus post instead of refusing the pack", () => {
    const { pack } = parsePackOutput(output(Array.from({ length: 11 }, () => post())));

    expect(pack.posts).toHaveLength(8);
  });

  it("forgives the casing a model reaches for in a platform name", () => {
    const posts = Array.from({ length: MIN_PACK_POSTS }, () => post({ platform: "LinkedIn" as PackPost["platform"] }));
    const { pack, dropped } = parsePackOutput(output(posts));

    expect(dropped).toBe(0);
    expect(pack.posts[0]?.platform).toBe("linkedin");
  });

  it("still refuses a platform that is not one of ours", () => {
    const posts = [
      ...Array.from({ length: MIN_PACK_POSTS }, () => post()),
      post({ platform: "tiktok" as PackPost["platform"] }),
    ];
    const { dropped } = parsePackOutput(output(posts));

    expect(dropped).toBe(1);
  });

  it("reads a pack out of a fenced code block", () => {
    const fenced = "```json\n" + output(Array.from({ length: 5 }, () => post())) + "\n```";

    expect(parsePackOutput(fenced).pack.posts).toHaveLength(5);
  });
});

describe("parsePackOutput — how it fails", () => {
  it("names prose as invalid JSON", () => {
    try {
      parsePackOutput("Sure! Here are some posts for you:");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnparseablePackError);
      expect((error as UnparseablePackError).reason).toBe("invalid_json");
    }
  });

  it("names a cut-off response as truncated, not as a bad answer", () => {
    try {
      parsePackOutput('{"angles":[{"angle":"Show the wo', { truncated: true });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as UnparseablePackError).reason).toBe("truncated");
    }
  });

  it("refuses a pack with too few usable posts, and says how few", () => {
    try {
      parsePackOutput(output(Array.from({ length: MIN_PACK_POSTS - 1 }, () => post())));
      throw new Error("should have thrown");
    } catch (error) {
      const failure = error as UnparseablePackError;
      expect(failure.reason).toBe("too_few_posts");
      expect(failure.counts.posts).toBe(MIN_PACK_POSTS - 1);
    }
  });

  it("refuses a pack with no usable angle", () => {
    const text = JSON.stringify({ angles: [{}], posts: Array.from({ length: 6 }, () => post()) });

    try {
      parsePackOutput(text);
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as UnparseablePackError).reason).toBe("no_angles");
    }
  });

  it("carries no model text on the error, only counts", () => {
    try {
      parsePackOutput(output([post({ script: "a secret from the user's page" })]));
      throw new Error("should have thrown");
    } catch (error) {
      expect(JSON.stringify(error as UnparseablePackError)).not.toContain("secret");
    }
  });
});

describe("normalizePost — hashtags said once", () => {
  it("folds a trailing hashtag line into the hashtag list", () => {
    const result = normalizePost(
      post({ script: "The body.\n\n#EdTech #AI", hashtags: ["#EdTech"] }),
    );

    expect(result.script).toBe("The body.");
    expect(result.hashtags).toEqual(["#EdTech", "#AI"]);
  });

  it("leaves a body that merely mentions a tag mid-sentence alone", () => {
    const result = normalizePost(post({ script: "We talk about #EdTech every day." }));

    expect(result.script).toBe("We talk about #EdTech every day.");
  });

  it("de-duplicates the list itself, keeping the first spelling", () => {
    const result = normalizePost(post({ hashtags: ["#EdTech", "#edtech", "#AI"] }));

    expect(result.hashtags).toEqual(["#EdTech", "#AI"]);
  });

  it("applies on the way in, so stored posts are already clean", () => {
    const posts = Array.from({ length: 5 }, () =>
      post({ script: "Body.\n#AI", hashtags: [] }),
    );
    const { pack } = parsePackOutput(output(posts));

    expect(pack.posts[0]?.script).toBe("Body.");
    expect(pack.posts[0]?.hashtags).toEqual(["#AI"]);
  });
});
