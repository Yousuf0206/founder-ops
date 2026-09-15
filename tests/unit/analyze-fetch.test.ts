import { describe, expect, it } from "vitest";

import {
  extractText,
  fetchPublicPage,
  FetchFailedError,
  isPrivateAddress,
  parsePublicUrl,
  RobotsDisallowedError,
  robotsAllows,
  UnsafeUrlError,
} from "@/lib/analyze/fetch";

/** 002 T1.3 — the server fetches user-supplied URLs, so SSRF and robots.txt are tested. */

type Route = { status?: number; body?: string; headers?: Record<string, string> };

function fakeWeb(routes: Record<string, Route>, dns: Record<string, string[]> = {}) {
  const requested: string[] = [];
  return {
    requested,
    deps: {
      lookup: async (host: string) => dns[host] ?? ["93.184.216.34"],
      fetchImpl: (async (input: string | URL | Request) => {
        const url = String(input);
        requested.push(url);
        const route = routes[url];
        if (!route) return new Response("not found", { status: 404 });
        return new Response(route.body ?? "", {
          status: route.status ?? 200,
          headers: { "content-type": "text/html", ...route.headers },
        });
      }) as typeof fetch,
    },
  };
}

describe("parsePublicUrl", () => {
  it("accepts a normal https URL", () => {
    expect(parsePublicUrl(" https://example.com/about#team ").toString()).toBe(
      "https://example.com/about",
    );
  });

  it("refuses other schemes, credentials, odd ports, and local hostnames", () => {
    expect(() => parsePublicUrl("ftp://example.com")).toThrow(UnsafeUrlError);
    expect(() => parsePublicUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
    expect(() => parsePublicUrl("https://user:pw@example.com")).toThrow(UnsafeUrlError);
    expect(() => parsePublicUrl("http://example.com:8080")).toThrow(UnsafeUrlError);
    expect(() => parsePublicUrl("http://localhost/admin")).toThrow(UnsafeUrlError);
    expect(() => parsePublicUrl("not a url")).toThrow(UnsafeUrlError);
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("robotsAllows", () => {
  it("allows everything when there are no rules or an empty Disallow", () => {
    expect(robotsAllows("", "/anything")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });

  it("honours a site-wide disallow", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/pricing")).toBe(false);
  });

  it("prefers a group naming this bot over the wildcard group", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: LumoOpsBot\nAllow: /";
    expect(robotsAllows(robots, "/pricing")).toBe(true);
  });

  it("lets the longest matching rule win", () => {
    const robots = "User-agent: *\nDisallow: /docs\nAllow: /docs/public";
    expect(robotsAllows(robots, "/docs/private")).toBe(false);
    expect(robotsAllows(robots, "/docs/public/intro")).toBe(true);
  });

  it("supports * and $ patterns", () => {
    const robots = "User-agent: *\nDisallow: /*.pdf$";
    expect(robotsAllows(robots, "/files/brochure.pdf")).toBe(false);
    expect(robotsAllows(robots, "/files/brochure.pdf?x=1")).toBe(true);
  });
});

describe("fetchPublicPage", () => {
  it("fetches, strips scripts, and extracts title and text", async () => {
    const web = fakeWeb({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/": {
        body: `<html><head><title>Lumo &amp; Co</title>
          <meta name="description" content="Learn faster"></head>
          <body><script>steal()</script><h1>Study smarter</h1><p>Free tier</p></body></html>`,
      },
    });

    const page = await fetchPublicPage("https://example.com/", web.deps);

    expect(page.title).toBe("Lumo & Co");
    expect(page.description).toBe("Learn faster");
    expect(page.text).toContain("Study smarter");
    expect(page.text).not.toContain("steal");
  });

  it("does not request a page robots.txt disallows (US1 AC4)", async () => {
    const web = fakeWeb({
      "https://example.com/robots.txt": { body: "User-agent: *\nDisallow: /", headers: { "content-type": "text/plain" } },
      "https://example.com/pricing": { body: "<p>secret</p>" },
    });

    await expect(fetchPublicPage("https://example.com/pricing", web.deps)).rejects.toThrow(
      RobotsDisallowedError,
    );
    expect(web.requested).not.toContain("https://example.com/pricing");
  });

  it("treats an unreachable robots.txt (5xx) as disallowed", async () => {
    const web = fakeWeb({ "https://example.com/robots.txt": { status: 503 } });

    await expect(fetchPublicPage("https://example.com/", web.deps)).rejects.toThrow(
      RobotsDisallowedError,
    );
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const web = fakeWeb({}, { "evil.example": ["10.0.0.5"] });

    await expect(fetchPublicPage("https://evil.example/", web.deps)).rejects.toThrow(
      UnsafeUrlError,
    );
    expect(web.requested).toHaveLength(0);
  });

  it("refuses a redirect into the cloud metadata address", async () => {
    const web = fakeWeb({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/go": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      },
    });

    await expect(fetchPublicPage("https://example.com/go", web.deps)).rejects.toThrow(
      UnsafeUrlError,
    );
    expect(web.requested.some((u) => u.includes("169.254.169.254"))).toBe(false);
  });

  it("refuses something that is not a web page", async () => {
    const web = fakeWeb({
      "https://example.com/robots.txt": { status: 404 },
      "https://example.com/file.zip": { headers: { "content-type": "application/zip" } },
    });

    await expect(fetchPublicPage("https://example.com/file.zip", web.deps)).rejects.toThrow(
      FetchFailedError,
    );
  });
});

describe("extractText", () => {
  it("reads a description whose attributes come in either order", () => {
    expect(
      extractText('<meta content="Either order" name="description">').description,
    ).toBe("Either order");
  });
});
