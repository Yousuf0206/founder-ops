import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * Migration 0015 — service-role-only functions must not be callable by the anon
 * key or a signed-in user. Supabase grants EXECUTE to both by default, so every
 * "service role only" function needs an explicit revoke, and this proves it.
 *
 * Each call uses a random workspace/job id, so a function that WAS callable
 * still finds nothing to change.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

const SERVICE_ONLY: { fn: string; args: () => Record<string, unknown> }[] = [
  {
    fn: "write_audit_system",
    args: () => ({ target_workspace: crypto.randomUUID(), audit_action: "probe" }),
  },
  {
    fn: "claim_ai_run_system",
    args: () => ({ target_workspace: crypto.randomUUID(), run_action: "probe" }),
  },
  {
    fn: "finish_ai_run_system",
    args: () => ({ run_id: crypto.randomUUID(), final_status: "failed" }),
  },
  { fn: "create_workspace_with_owner", args: () => ({ p_owner: crypto.randomUUID(), p_name: "x", p_slug: "x", p_plan: "solo" }) },
  { fn: "claim_publish_job", args: () => ({ p_job_id: crypto.randomUUID() }) },
  { fn: "finish_publish_job", args: () => ({ p_job_id: crypto.randomUUID(), p_published: false }) },
  { fn: "due_publish_jobs", args: () => ({ p_limit: 1 }) },
  { fn: "mark_account_expired", args: () => ({ p_account_id: crypto.randomUUID(), p_reason: "probe" }) },
  { fn: "forbidden_claims_in", args: () => ({ target_workspace: crypto.randomUUID(), body: "x" }) },
  { fn: "enqueue_auto_publish_job", args: () => ({ p_draft_id: crypto.randomUUID(), p_account_id: crypto.randomUUID() }) },
  { fn: "auto_publish_candidates", args: () => ({ p_limit: 1 }) },
];

describeIfConfigured("service-role-only functions", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let user: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);
    anon = createClient(e.url, e.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    user = await createUser(e, admin, `grants-${suffix}@example.test`);
  });

  afterAll(async () => {
    if (!env) return;
    if (user) await deleteUser(admin, user.id);
  });

  for (const { fn, args } of SERVICE_ONLY) {
    it(`${fn}: refused for the anon key`, async () => {
      const { error } = await anon.rpc(fn, args());
      expect(error, `${fn} must not be callable anonymously`).not.toBeNull();
    });

    it(`${fn}: refused for a signed-in user`, async () => {
      const { error } = await user.client.rpc(fn, args());
      expect(error, `${fn} must not be callable by authenticated`).not.toBeNull();
    });
  }
});
