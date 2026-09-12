/**
 * CI guard (T3.10) for Constitution I: draft, never auto-publish.
 *
 * The risk table names "scope creep to auto-publish" as risk #1 with
 * "constitution block" as the mitigation. This is that block, mechanised: a
 * publishing SDK cannot enter the dependency tree without failing the build.
 *
 * It is a coarse check by design. It cannot prove the absence of an outbound
 * call — a bare fetch() to a platform API would slip past it. What it does is
 * make the easy path (npm install a client library) impossible, so adding
 * auto-publish requires deliberately deleting this file, which shows up in
 * review.
 *
 *   npm run check:no-publish
 */
import { readFileSync } from "node:fs";

const FORBIDDEN_PACKAGES = [
  // social platforms
  "twitter-api-v2",
  "twit",
  "instagram-private-api",
  "instagram-web-api",
  "facebook-nodejs-business-sdk",
  "fb",
  "googleapis", // pulls in the YouTube upload surface
  "youtube-api",
  "linkedin-api-client",
  "tiktok-api",
  "@tiktok/",
  "telegraf", // Telegram bot sending — FR-Q-005 is unscoped; not in v1
  "node-telegram-bot-api",
  "discord.js",
  // bulk messaging
  "@sendgrid/mail",
  "mailchimp",
  "@mailchimp/",
  "twilio",
  "nodemailer", // arbitrary SMTP sending; Phase 4 uses Resend's single-send API
];

// Resend is permitted: Phase 4 sends one notification to a workspace owner.
// Constitution IV bars cold outreach and bulk messaging, not internal alerts.
const ALLOWED = new Set(["resend"]);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = Object.keys({
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
});

const violations = declared.filter((name) => {
  if (ALLOWED.has(name)) return false;
  return FORBIDDEN_PACKAGES.some(
    (forbidden) => name === forbidden || name.startsWith(forbidden),
  );
});

if (violations.length > 0) {
  console.error("Publishing or bulk-messaging dependency detected (Constitution I / IV):\n");
  for (const name of violations) console.error(`  - ${name}`);
  console.error(
    "\nThis product drafts; humans publish. If this dependency is genuinely needed for\n" +
      "something else, add it to ALLOWED in scripts/check-no-publish.mjs with a comment\n" +
      "explaining why it cannot publish or send in bulk.",
  );
  process.exit(1);
}

console.log("check:no-publish — no publishing or bulk-messaging dependencies.");
