/**
 * Workspace bootstrap (T0.6, FR-Q-006).
 *
 * Admin path for creating a workspace on someone's behalf. Users normally
 * create their own at /onboarding. This uses the service-role key and
 * therefore bypasses RLS by design.
 *
 *   npm run seed:workspace -- --name "Lumo Learn" --slug lumo --owner you@example.com
 *
 * Idempotent: re-running with the same slug updates the name and ensures the
 * owner membership exists, rather than creating a duplicate.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

type Args = { name: string; slug: string; owner: string; cap?: number };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const name = get("--name");
  const slug = get("--slug");
  const owner = get("--owner");
  const cap = get("--cap");

  if (!name || !slug || !owner) {
    console.error(
      'Usage: npm run seed:workspace -- --name "Lumo Learn" --slug lumo --owner you@example.com [--cap 50]',
    );
    process.exit(1);
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    console.error(`Invalid slug "${slug}": use lowercase letters, digits, and hyphens.`);
    process.exit(1);
  }

  return { name, slug, owner, cap: cap ? Number(cap) : undefined };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. The owner must already have an auth account (they sign in once first).
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", args.owner)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile) {
    console.error(
      `No account found for ${args.owner}.\n` +
        `Ask them to sign in at /login once — that creates the profile — then re-run this.`,
    );
    process.exit(1);
  }

  // 2. Upsert the workspace by slug.
  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .upsert(
      {
        name: args.name,
        slug: args.slug,
        ...(args.cap !== undefined ? { daily_run_cap: args.cap } : {}),
      },
      { onConflict: "slug" },
    )
    .select("id, name, slug, daily_run_cap")
    .single();

  if (workspaceError) throw workspaceError;

  // 3. Ensure the owner membership.
  const { error: membershipError } = await admin
    .from("memberships")
    .upsert(
      { user_id: profile.id, workspace_id: workspace.id, role: "owner" },
      { onConflict: "user_id,workspace_id" },
    );

  if (membershipError) throw membershipError;

  console.log(
    `Workspace "${workspace.name}" (${workspace.slug}) ready.\n` +
      `  id:            ${workspace.id}\n` +
      `  owner:         ${profile.email}\n` +
      `  daily run cap: ${workspace.daily_run_cap}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
