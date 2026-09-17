import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching a user-supplied URL from the server (002 T1.3, FR-O-003).
 *
 * The server fetching whatever address a user types is a server-side request
 * forgery surface, so every hop — including each redirect — is checked:
 *   - http/https on standard ports only, no embedded credentials
 *   - every resolved address must be public (no loopback, private, link-local,
 *     cloud metadata, or other reserved ranges)
 *   - robots.txt must permit the path, checked BEFORE the page is requested
 *   - bounded time, bytes, and redirects
 *
 * Residual risk: DNS can change between the check and the connection (DNS
 * rebinding). Pinning the resolved address needs a custom HTTP agent; until
 * then the short timeout and the read-only, response-discarding use here limit
 * what a rebinding could achieve.
 */

export const USER_AGENT = "LumoGrowBot/1.0 (+product analysis; honours robots.txt)";
const ROBOTS_AGENT = "lumogrowbot";
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_TEXT_CHARS = 20_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(
      `robots.txt at ${new URL(url).origin} does not allow fetching this page, so it was not fetched.`,
    );
    this.name = "RobotsDisallowedError";
  }
}

export class FetchFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchFailedError";
  }
}

export type FetchDeps = {
  lookup?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
};

export type FetchedPage = {
  url: string;
  bytes: number;
  title: string;
  description: string;
  text: string;
};

async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("Enter a full URL, starting with https://.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be analysed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Only standard web ports (80 and 443) are allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new UnsafeUrlError("That address is not a public website.");
  }

  url.hash = "";
  return url;
}

// --- address classification ------------------------------------------------

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // includes 169.254.169.254, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
}

/** True for anything that is not a routable public address — including non-IPs. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));

  if (version === 6) {
    const lower = ip.toLowerCase();

    const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]!);

    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1]!, 16);
      const low = parseInt(hex[2]!, 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }

    const first = parseInt(lower.split(":")[0] || "0", 16);
    if (first < 0x0100) return true; // ::/8 — unspecified, loopback, v4-compatible
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64 can reach private v4
    if (lower.startsWith("2001:db8:")) return true; // documentation
    return false;
  }

  return true;
}

async function assertPublicHost(url: URL, lookup: (host: string) => Promise<string[]>) {
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new FetchFailedError(`Could not resolve ${host}.`);
    }
  }

  if (addresses.length === 0) throw new FetchFailedError(`Could not resolve ${host}.`);
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError(
      "That address resolves to a private or reserved network and cannot be fetched.",
    );
  }
}

// --- robots.txt (RFC 9309, the parts that matter here) ---------------------

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRobotsPattern(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(`^${body.split("*").map(escapeRegex).join(".*")}${anchored ? "$" : ""}`);
  return regex.test(path);
}

export function robotsAllows(robotsTxt: string, path: string, agent = ROBOTS_AGENT): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };

  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (!line || colon < 0) continue;

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if ((key === "allow" || key === "disallow") && current && value) {
        current.rules.push({ allow: key === "allow", pattern: value });
      }
    }
  }

  const name = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && name.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));

  // Longest matching rule wins; on a tie, Allow wins.
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!matchesRobotsPattern(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { allow: rule.allow, length };
    }
  }

  return best ? best.allow : true;
}

// --- fetching ---------------------------------------------------------------

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

type Hop = { url: URL; status: number; contentType: string; body: string };

async function safeGet(
  start: URL,
  deps: Required<FetchDeps>,
  beforeHop?: (url: URL) => Promise<void>,
): Promise<Hop> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, deps.lookup);
    if (beforeHop) await beforeHop(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await deps.fetchImpl(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain;q=0.9" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new FetchFailedError(`${url.origin} redirected without a location.`);
        url = parsePublicUrl(new URL(location, url).toString());
        continue;
      }

      return {
        url,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: await readLimited(response),
      };
    } catch (error) {
      if (error instanceof UnsafeUrlError || error instanceof FetchFailedError) throw error;
      if (error instanceof RobotsDisallowedError) throw error;
      throw new FetchFailedError(
        error instanceof Error && error.name === "AbortError"
          ? `Timed out fetching ${url.origin}.`
          : `Could not fetch ${url.origin}.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new FetchFailedError(`Too many redirects from ${start.origin}.`);
}

/** RFC 9309: 4xx means no rules; unreachable or 5xx means assume disallowed. */
async function robotsPermits(url: URL, deps: Required<FetchDeps>): Promise<boolean> {
  let robots: Hop;
  try {
    robots = await safeGet(new URL("/robots.txt", url.origin), deps);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    return false;
  }

  if (robots.status >= 400 && robots.status < 500) return true;
  if (robots.status >= 500) return false;
  return robotsAllows(robots.body, `${url.pathname}${url.search}`);
}

export async function fetchPublicPage(raw: string, deps: FetchDeps = {}): Promise<FetchedPage> {
  const resolved: Required<FetchDeps> = {
    lookup: deps.lookup ?? defaultLookup,
    fetchImpl: deps.fetchImpl ?? fetch,
  };

  const start = parsePublicUrl(raw);

  const page = await safeGet(start, resolved, async (url) => {
    if (!(await robotsPermits(url, resolved))) throw new RobotsDisallowedError(url.toString());
  });

  if (page.status >= 400) {
    throw new FetchFailedError(`${page.url.origin} returned HTTP ${page.status}.`);
  }
  if (!/text\/html|text\/plain|application\/xhtml/i.test(page.contentType)) {
    throw new FetchFailedError(
      `That URL is not a web page (${page.contentType || "unknown content type"}).`,
    );
  }

  return {
    url: page.url.toString(),
    bytes: Buffer.byteLength(page.body),
    ...extractText(page.body),
  };
}

// --- text extraction --------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (match, code: string) => {
      const n = Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    });
}

/**
 * Reads one `<meta>` value, accepting either attribute order.
 *
 * `kind` is "name" for standard metadata and "property" for Open Graph, which
 * uses `property="og:title"` rather than `name=`.
 */
function metaContent(html: string, kind: "name" | "property", key: string): string {
  const k = escapeRegex(key);
  const value =
    html.match(
      new RegExp(`<meta[^>]+${kind}=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"),
    )?.[1] ??
    html.match(
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${kind}=["']${k}["']`, "i"),
    )?.[1] ??
    "";
  return decodeEntities(value).trim();
}

export function extractText(html: string): { title: string; description: string; text: string } {
  // Open Graph is the fallback, not the primary, for both fields. A client-
  // rendered marketing site routinely ships correct og: tags above an empty
  // <body>, and those tags are the founder's own words about the product — so
  // reading them is the difference between "we could not read your page" and a
  // real result for a large and perfectly ordinary class of sites.
  const title =
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() ||
    metaContent(html, "property", "og:title");

  const description =
    metaContent(html, "name", "description") ||
    metaContent(html, "property", "og:description");

  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article|tr|header|footer)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);

  return { title, description, text };
}
