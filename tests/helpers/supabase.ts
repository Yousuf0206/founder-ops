import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Test harness against a LOCAL Supabase instance (T0.12), or an explicitly
 * opted-in dedicated remote test project (no local Docker available).
 *
 * These tests create and delete real users and workspaces. They refuse to run
 * against TEST_SUPABASE_URL when it is missing, when it is local but the app's
 * own project (a copy-paste mistake), or when it points remote without the
 * explicit TEST_SUPABASE_ALLOW_REMOTE=true opt-in — so a misconfigured
 * .env.local cannot aim them at production by accident.
 */

export function testEnv() {
  const url = process.env.TEST_SUPABASE_URL;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) return null;

  const host = new URL(url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";

  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      "Refusing to run destructive tests: TEST_SUPABASE_URL is the same as NEXT_PUBLIC_SUPABASE_URL (production).",
    );
  }

  if (!isLocal && process.env.TEST_SUPABASE_ALLOW_REMOTE !== "true") {
    throw new Error(
      `Refusing to run destructive tests against ${host}. TEST_SUPABASE_URL must be local, ` +
        `or set TEST_SUPABASE_ALLOW_REMOTE=true to confirm this is a dedicated remote test project.`,
    );
  }

  return { url, anonKey, serviceRoleKey };
}

export function adminClient(env: NonNullable<ReturnType<typeof testEnv>>): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a confirmed user and returns a client authenticated as them. */
export async function createUser(
  env: NonNullable<ReturnType<typeof testEnv>>,
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const password = `test-${crypto.randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, client };
}

export async function deleteUser(admin: SupabaseClient, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}
