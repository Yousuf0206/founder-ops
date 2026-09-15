/**
 * CI guard for the publish path (002 T2.12, FR-P-009). Replaces v1's
 * check-no-publish.mjs in the same slice that adds the first connector
 * (decisions §8) — the build is never in a state where publishing exists and
 * is unguarded.
 *
 * v1's rule was "nothing can publish". v2's rule is "nothing can publish except
 * through the guarded path". Mechanised as:
 *
 *   1. No publishing SDK or bulk-messaging dependency (plan D4: plain fetch;
 *      Constitution VI: no cold spam). Resend stays the single allowed sender.
 *   2. Platform API hosts appear only under lib/connectors/.
 *   3. Connector publish modules (lib/connectors/<platform>/publish.ts) are
 *      imported only by lib/publish/execute.ts — the path that runs the claim
 *      check and cap reservation first.
 *   4. No client component imports lib/connectors or lib/publish.
 *
 * Coarse by design: a determined `fetch` built from string fragments would pass.
 * It exists so the easy path to an unguarded post fails the build.
 *
 *   npm run check:publish-guards
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const FORBIDDEN_PACKAGES = [
  "twitter-api-v2",
  "twit",
  "instagram-private-api",
  "instagram-web-api",
  "facebook-nodejs-business-sdk",
  "fb",
  "googleapis",
  "youtube-api",
  "linkedin-api-client",
  "tiktok-api",
  "@tiktok/",
  "telegraf",
  "node-telegram-bot-api",
  "discord.js",
  "@sendgrid/mail",
  "mailchimp",
  "@mailchimp/",
  "twilio",
  "nodemailer",
];
const ALLOWED_PACKAGES = new Set(["resend"]);

const PLATFORM_HOSTS = [
  "api.linkedin.com",
  "www.linkedin.com/oauth",
  "graph.facebook.com",
  "graph.instagram.com",
  "api.twitter.com",
  "api.x.com",
  "open.tiktokapis.com",
  "youtube.googleapis.com",
  "www.googleapis.com/upload",
];

const SCAN_ROOTS = ["app", "lib", "middleware.ts"];
const EXECUTOR = "lib/publish/execute.ts";

const problems = [];

// 1. dependencies ------------------------------------------------------------
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const name of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
  if (ALLOWED_PACKAGES.has(name)) continue;
  if (FORBIDDEN_PACKAGES.some((f) => name === f || name.startsWith(f))) {
    problems.push(`package.json: ${name} is a publishing SDK or bulk sender`);
  }
}

// 2–4. source files ------------------------------------------------------------
function walk(path, out) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return out;
  }
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(join(path, entry), out);
    }
  } else if (/\.(ts|tsx|js|mjs)$/.test(path)) {
    out.push(path);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((root) => walk(root, [])).map((file) => relative(".", file).split(sep).join("/"));

const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

for (const file of files) {
  const source = readFileSync(file, "utf8");

  if (!file.startsWith("lib/connectors/")) {
    for (const host of PLATFORM_HOSTS) {
      if (source.includes(host)) problems.push(`${file}: references ${host} outside lib/connectors/`);
    }
  }

  const isClient = /^\s*["']use client["']/.test(source);

  for (const match of source.matchAll(importPattern)) {
    const spec = match[1];
    const touchesConnectors = /(^|\/)connectors\//.test(spec) || spec.startsWith("@/lib/connectors");
    const touchesPublish = /(^|\/)lib\/publish\//.test(spec) || spec.startsWith("@/lib/publish");

    if (touchesConnectors && /\/publish$/.test(spec) && file !== EXECUTOR) {
      problems.push(`${file}: imports ${spec}; only ${EXECUTOR} may import a connector's publish module`);
    }
    if (isClient && (touchesConnectors || touchesPublish)) {
      problems.push(`${file}: client component imports server-only ${spec}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Publish guard failed (FR-P-009, Constitution V–VI):\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nEvery post must go through lib/publish/execute.ts, which runs the claim check and cap\n" +
      "reservation before the platform call. See scripts/check-publish-guards.mjs.",
  );
  process.exit(1);
}

console.log(`check:publish-guards — ${files.length} files clean; publishing only via ${EXECUTOR}.`);
