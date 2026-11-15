import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The subtraction contract (6.0.0-subtraction: SC-03, SC-04, FR-03, FR-06).
 *
 * Every other rule in this milestone is about restraint, and restraint is what
 * a codebase loses first: the five-destination nav these tests replaced was
 * itself added one reasonable-looking entry at a time. So the contract is
 * asserted against the source, not left to review.
 *
 * These read files as text on purpose. The subject is a layout and two client
 * components, which cannot be imported in a node environment without a React
 * renderer, and the thing worth pinning is the shape of the contract rather
 * than rendered output: how many primary destinations exist, that Results is
 * one screen, and that every post offers Copy.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(root + path, "utf8");

describe("the default signed-in surface", () => {
  const layout = read("app/(growth)/layout.tsx");

  it("exposes exactly two primary destinations: Start and Results (SC-04)", () => {
    const nav = layout.slice(layout.indexOf("const NAV = ["), layout.indexOf("] as const;"));
    const hrefs = [...nav.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual(["/start", "/results"]);
  });

  it("keeps Advanced out of the primary nav (constitution R2)", () => {
    const nav = layout.slice(layout.indexOf("const NAV = ["), layout.indexOf("] as const;"));

    expect(nav).not.toContain("/advanced");
    // Reachable, but from the footer only.
    expect(layout).toContain('href="/advanced"');
  });
});

describe("Results", () => {
  it("is one route holding both problems and posts (FR-03)", () => {
    expect(existsSync(root + "app/(growth)/results/page.tsx")).toBe(true);

    const page = read("app/(growth)/results/page.tsx");
    expect(page).toContain("analyze_runs");
    expect(page).toContain("growth_packs");
  });

  it("has at most the two tabs the constitution allows", () => {
    const tabs = read("app/(growth)/results/results-tabs.tsx");
    const ids = [...tabs.matchAll(/<Tab id="(\w+)"/g)].map((match) => match[1]);

    expect(ids).toEqual(["problems", "posts"]);
  });

  it("replaced /hurdles and /pack rather than adding a third screen", () => {
    expect(existsSync(root + "app/(growth)/hurdles")).toBe(false);
    expect(existsSync(root + "app/(growth)/pack")).toBe(false);

    // Old links were live in production, so they redirect rather than 404.
    const config = read("next.config.ts");
    expect(config).toContain('source: "/hurdles", destination: "/results"');
    expect(config).toContain('source: "/pack", destination: "/results"');
  });

  it("sends a finished analysis straight here (FR-01, FR-02)", () => {
    expect(read("app/(growth)/start/actions.ts")).toContain('redirect("/results")');
  });
});

describe("a post", () => {
  const card = read("app/(growth)/results/pack-post.tsx");

  it("offers Copy, unconditionally (SC-03, FR-06, R7)", () => {
    expect(card).toContain("CopyPost");
    // Not behind the publishable check: a draft-only network is exactly the
    // case where copying is the only way to use the post.
    const copyAt = card.indexOf("<CopyPost");
    const readViewAt = card.indexOf("{editing ? (");
    expect(copyAt).toBeGreaterThan(readViewAt);
  });

  it("puts the post's own words on the clipboard", () => {
    const copy = read("app/(growth)/results/copy-post.tsx");
    const body = copy.slice(copy.indexOf("export function postText"));

    for (const part of ["post.hook", "post.script", "post.cta", "post.hashtags"]) {
      expect(body).toContain(part);
    }
    // Clipboard access can be refused outright; silence would look like success.
    expect(copy).toContain("role=\"alert\"");
  });
});
