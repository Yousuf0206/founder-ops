import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Test harness against a LOCAL Supabase instance (T0.12).
 *
 * These tests create and delete real users and workspaces. They refuse to run
 * unless TEST_SUPABASE_URL points at localhost, so a misconfigured .env.local
 * cannot aim them at a hosted project.
 */

export function testEnv() {
  const url = process.env.TEST_SUPABASE_URL;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) return null;

  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to run destructive tests against ${host}. TEST_SUPABASE_URL must be local.`,
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
