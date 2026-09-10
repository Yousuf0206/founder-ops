import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * T0.9 / SC-003 — the isolation proof.
 *
 * Two real authenticated users, two real workspaces. The member sees their own
 * rows; the stranger sees zero. Asserted against a live Postgres, because RLS
 * that is only reasoned about is not RLS that is known to work.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured("RLS: workspace isolation (Phase 0 tables)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const memberEmail = `member-${suffix}@example.test`;
  const strangerEmail = `stranger-${suffix}@example.test`;

  let admin: SupabaseClient;
  let member: { id: string; client: SupabaseClient };
  let stranger: { id: string; client: SupabaseClient };
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    member = await createUser(e, admin, memberEmail);
    stranger = await createUser(e, admin, strangerEmail);

    const { data: workspaces, error } = await admin
      .from("workspaces")
      .insert([
        { name: `Members WS ${suffix}`, slug: `members-${suffix}` },
        { name: `Other WS ${suffix}`, slug: `other-${suffix}` },
      ])
      .select("id, slug");
    if (error) throw error;

    workspaceId = workspaces.find((w) => w.slug === `members-${suffix}`)!.id;
    otherWorkspaceId = workspaces.find((w) => w.slug === `other-${suffix}`)!.id;

    const { error: membershipError } = await admin
      .from("memberships")
      .insert({ user_id: member.id, workspace_id: workspaceId, role: "owner" });
    if (membershipError) throw membershipError;
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().in("id", [workspaceId, otherWorkspaceId]);
    if (member) await deleteUser(admin, member.id);
    if (stranger) await deleteUser(admin, stranger.id);
  });

  it("a member reads their own workspace", async () => {
    const { data, error } = await member.client.from("workspaces").select("id, name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(workspaceId);
  });

  it("a member cannot read a workspace they do not belong to", async () => {
    const { data, error } = await member.client
      .from("workspaces")
      .select("id")
      .eq("id", otherWorkspaceId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member reads zero workspaces", async () => {
    const { data, error } = await stranger.client.from("workspaces").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member reads zero memberships", async () => {
    const { data, error } = await stranger.client.from("memberships").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member reads zero invitations", async () => {
    const { data, error } = await stranger.client.from("invitations").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member cannot insert a membership into someone else's workspace", async () => {
    const { error } = await stranger.client
      .from("memberships")
      .insert({ user_id: stranger.id, workspace_id: workspaceId, role: "owner" });

    expect(error).not.toBeNull();
  });

  it("a non-member cannot rename someone else's workspace", async () => {
    const { data, error } = await stranger.client
      .from("workspaces")
      .update({ name: "hijacked" })
      .eq("id", workspaceId)
      .select("id");

    // RLS filters the row out rather than raising: nothing is updated.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: check } = await admin
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();
    expect(check!.name).not.toBe("hijacked");
  });

  it("no authenticated user can create a workspace (FR-Q-006: seed only)", async () => {
    const { error } = await member.client
      .from("workspaces")
      .insert({ name: "self-serve", slug: `self-serve-${suffix}` });

    expect(error).not.toBeNull();
  });
});

describeIfConfigured("RLS: invitation redemption", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const ownerEmail = `owner-${suffix}@example.test`;
  const inviteeEmail = `invitee-${suffix}@example.test`;
  const outsiderEmail = `outsider-${suffix}@example.test`;

  let admin: SupabaseClient;
  let owner: { id: string; client: SupabaseClient };
  let invitee: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let workspaceId: string;

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    owner = await createUser(e, admin, ownerEmail);
    invitee = await createUser(e, admin, inviteeEmail);
    outsider = await createUser(e, admin, outsiderEmail);

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({ name: `Invite WS ${suffix}`, slug: `invite-${suffix}` })
      .select("id")
      .single();
    if (error) throw error;
    workspaceId = workspace.id;

    await admin
      .from("memberships")
      .insert({ user_id: owner.id, workspace_id: workspaceId, role: "owner" });
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const user of [owner, invitee, outsider]) {
      if (user) await deleteUser(admin, user.id);
    }
  });

  it("an owner can create an invitation", async () => {
    const { error } = await owner.client.from("invitations").insert({
      workspace_id: workspaceId,
      email: inviteeEmail,
      role: "editor",
      token: `tok-${suffix}`,
      invited_by: owner.id,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    expect(error).toBeNull();
  });

  it("an invitation cannot be redeemed by a different account", async () => {
    const { error } = await outsider.client.rpc("accept_invitation", {
      invitation_token: `tok-${suffix}`,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/different account/i);
  });

  it("the addressed invitee redeems it and becomes a member", async () => {
    const { error } = await invitee.client.rpc("accept_invitation", {
      invitation_token: `tok-${suffix}`,
    });
    expect(error).toBeNull();

    const { data } = await invitee.client.from("workspaces").select("id");
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(workspaceId);
  });

  it("an invitation cannot be redeemed twice", async () => {
    const { error } = await invitee.client.rpc("accept_invitation", {
      invitation_token: `tok-${suffix}`,
    });

    expect(error).not.toBeNull();
  });

  it("an editor cannot invite others (owner-only)", async () => {
    const { error } = await invitee.client.from("invitations").insert({
      workspace_id: workspaceId,
      email: `another-${suffix}@example.test`,
      role: "viewer",
      token: `tok2-${suffix}`,
      invited_by: invitee.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(error).not.toBeNull();
  });
});
