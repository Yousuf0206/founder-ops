import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * 002 T0.11 — the 0008 rules, enforced by the database whoever writes the row.
 * Decisions §4 (modes), §5 (publish cap), §6 (plans); US1 AC2, US2 AC6–8.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured("plans and workspace settings (0008)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let owner: { id: string; client: SupabaseClient };
  let editor: { id: string; client: SupabaseClient };
  let creator: { id: string; client: SupabaseClient };
  let soloId: string;
  let teamId: string;

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    owner = await createUser(e, admin, `plan-owner-${suffix}@example.test`);
    editor = await createUser(e, admin, `plan-editor-${suffix}@example.test`);
    creator = await createUser(e, admin, `plan-creator-${suffix}@example.test`);

    const { data, error } = await admin
      .from("workspaces")
      .insert([
        // A multi-row insert sends null for a column missing from any row, so
        // both rows name their plan rather than relying on the column default.
        { name: `Solo ${suffix}`, slug: `plans-solo-${suffix}`, plan: "solo" },
        { name: `Team ${suffix}`, slug: `plans-team-${suffix}`, plan: "team" },
      ])
      .select("id, slug");
    if (error) throw error;

    soloId = data.find((w) => w.slug === `plans-solo-${suffix}`)!.id;
    teamId = data.find((w) => w.slug === `plans-team-${suffix}`)!.id;

    const { error: memberError } = await admin.from("memberships").insert([
      { user_id: owner.id, workspace_id: soloId, role: "owner" },
      { user_id: owner.id, workspace_id: teamId, role: "owner" },
      { user_id: editor.id, workspace_id: soloId, role: "editor" },
    ]);
    if (memberError) throw memberError;
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().like("slug", `%${suffix}%`);
    for (const user of [owner, editor, creator]) if (user) await deleteUser(admin, user.id);
  });

  it("a new workspace defaults to solo, approve_then_publish, cap 5, UTC", async () => {
    const { data } = await admin
      .from("workspaces")
      .select("plan, publish_mode, daily_publish_cap, timezone, auto_enabled")
      .eq("id", soloId)
      .single();

    expect(data).toEqual({
      plan: "solo",
      publish_mode: "approve_then_publish",
      daily_publish_cap: 5,
      timezone: "UTC",
      auto_enabled: false,
    });
  });

  it("the solo plan refuses auto_within_rules", async () => {
    const { error } = await owner.client
      .from("workspaces")
      .update({ publish_mode: "auto_within_rules" })
      .eq("id", soloId);

    expect(error?.message).toMatch(/team or business/i);
  });

  it("the team plan allows auto_within_rules", async () => {
    const { error } = await owner.client
      .from("workspaces")
      .update({ publish_mode: "auto_within_rules" })
      .eq("id", teamId);

    expect(error).toBeNull();
  });

  it("an editor cannot change the publish mode", async () => {
    await editor.client.from("workspaces").update({ publish_mode: "draft_only" }).eq("id", soloId);

    const { data } = await admin.from("workspaces").select("publish_mode").eq("id", soloId).single();
    expect(data!.publish_mode).toBe("approve_then_publish");
  });

  it("an owner cannot change their own plan", async () => {
    const { error } = await owner.client
      .from("workspaces")
      .update({ plan: "business" })
      .eq("id", soloId);

    expect(error?.message).toMatch(/administrator/i);
  });

  it("the publish cap is clamped to the plan ceiling", async () => {
    const over = await owner.client.from("workspaces").update({ daily_publish_cap: 6 }).eq("id", soloId);
    expect(over.error?.message).toMatch(/between 1 and 5/);

    const ok = await owner.client.from("workspaces").update({ daily_publish_cap: 3 }).eq("id", soloId);
    expect(ok.error).toBeNull();
  });

  it("the AI run cap cannot be raised past the plan", async () => {
    const { error } = await owner.client
      .from("workspaces")
      .update({ daily_run_cap: 51 })
      .eq("id", soloId);

    expect(error?.message).toMatch(/at most 50/);
  });

  it("an unknown timezone is refused and a real one accepted", async () => {
    const bad = await owner.client.from("workspaces").update({ timezone: "Mars/Olympus" }).eq("id", soloId);
    expect(bad.error?.message).toMatch(/unknown timezone/i);

    const good = await owner.client.from("workspaces").update({ timezone: "Asia/Karachi" }).eq("id", soloId);
    expect(good.error).toBeNull();
  });

  it("self-serve creation stops at the plan's workspace limit", async () => {
    const args = (n: number) => ({
      p_owner: creator.id,
      p_name: `Created ${n} ${suffix}`,
      p_slug: `plans-created-${n}-${suffix}`,
      p_plan: "solo",
      p_primary_url: "https://example.test",
    });

    const first = await admin.rpc("create_workspace_with_owner", args(1));
    expect(first.error).toBeNull();

    const second = await admin.rpc("create_workspace_with_owner", args(2));
    expect(second.error?.message).toMatch(/workspace limit reached/i);
  });

  it("an invitation cannot be redeemed past the plan's seat limit (0013)", async () => {
    // solo: 3 seats. The owner and editor already hold two; add a third, then invite a fourth.
    const third = await createUser(env!, admin, `plan-third-${suffix}@example.test`);
    const fourth = await createUser(env!, admin, `plan-fourth-${suffix}@example.test`);
    try {
      await admin.from("memberships").insert({ user_id: third.id, workspace_id: soloId, role: "viewer" });
      await admin.from("invitations").insert({
        workspace_id: soloId,
        email: `plan-fourth-${suffix}@example.test`,
        role: "viewer",
        token: `seat-${suffix}`,
        invited_by: owner.id,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const { error } = await fourth.client.rpc("accept_invitation", { invitation_token: `seat-${suffix}` });
      expect(error?.message).toMatch(/seat limit/i);
    } finally {
      await admin.from("invitations").delete().eq("token", `seat-${suffix}`);
      await admin.from("memberships").delete().eq("user_id", third.id);
      await deleteUser(admin, third.id);
      await deleteUser(admin, fourth.id);
    }
  });

  it("the last owner cannot be removed from the app (0013)", async () => {
    const { data: membership } = await admin
      .from("memberships")
      .select("id")
      .eq("workspace_id", soloId)
      .eq("user_id", owner.id)
      .single();

    const { error } = await owner.client.from("memberships").delete().eq("id", membership!.id);
    expect(error?.message).toMatch(/at least one owner/i);
  });

  it("a signed-in user cannot call the creation function directly", async () => {
    const { error } = await creator.client.rpc("create_workspace_with_owner", {
      p_owner: creator.id,
      p_name: `Sneaky ${suffix}`,
      p_slug: `plans-sneaky-${suffix}`,
      p_plan: "business",
    });

    expect(error).not.toBeNull();
  });
});
