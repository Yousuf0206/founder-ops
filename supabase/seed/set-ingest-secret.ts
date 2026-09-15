/**
 * Generates a workspace's lead-ingest secret (T4.2).
 *
 *   npm run set:ingest-secret -- --slug lumo
 *
 * Prints the secret ONCE. Only its SHA-256 hash is stored, so it cannot be
 * recovered later — re-run this to rotate, which immediately invalidates the
 * old one.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { hashSecret } from "../../lib/leads/ingest";

config({ path: ".env" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const slugIndex = argv.indexOf("--slug");
  const slug = slugIndex >= 0 ? argv[slugIndex + 1] : undefined;
  const notifyIndex = argv.indexOf("--notify");
  const notify = notifyIndex >= 0 ? argv[notifyIndex + 1] : undefined;

  if (!slug) {
    console.error(
      "Usage: npm run set:ingest-secret -- --slug lumo [--notify owner@example.com]",
    );
    process.exit(1);
  }

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const secret = randomBytes(32).toString("base64url");

  const { data, error } = await admin
    .from("workspaces")
    .update({
      ingest_secret_hash: hashSecret(secret),
      ...(notify ? { notify_email: notify } : {}),
    })
    .eq("slug", slug)
    .select("id, name, notify_email")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    console.error(`No workspace with slug "${slug}".`);
    process.exit(1);
  }

  console.log(
    [
      `Ingest secret set for "${data.name}".`,
      "",
      "  Shown once — store it now. Only its hash is kept.",
      "",
      `  x-founder-ops-workspace: ${slug}`,
      `  x-founder-ops-secret:    ${secret}`,
      "",
      `  notify email: ${data.notify_email ?? "(not set — high-intent alerts will be skipped)"}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
