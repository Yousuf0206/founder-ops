/**
 * Sets (or resets) a user's sign-in password.
 *
 *   npm run set:password -- --email you@example.com
 *   npm run set:password -- --email you@example.com --password "chosen-password"
 *
 * Without --password a strong one is generated and printed ONCE. If no account
 * exists for the email yet, one is created with the email marked confirmed —
 * it still has no workspace access until seeded or invited. Uses the
 * service-role key, so it is an admin action like the other seed scripts.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

function arg(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const email = arg(argv, "--email")?.trim().toLowerCase();
  const chosen = arg(argv, "--password");

  if (!email || !email.includes("@")) {
    console.error('Usage: npm run set:password -- --email you@example.com [--password "..."]');
    process.exit(1);
  }
  if (chosen !== undefined && (chosen.length < 8 || chosen.length > 72)) {
    console.error("Password must be 8 to 72 characters.");
    process.exit(1);
  }

  const password = chosen ?? randomBytes(18).toString("base64url");

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 1000) break;
  }

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`Password updated for ${email}.`);
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`Account created for ${email} (no workspace access until seeded or invited).`);
  }

  if (!chosen) {
    console.log(["", "  Shown once — store it now.", "", `  password: ${password}`].join("\n"));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
