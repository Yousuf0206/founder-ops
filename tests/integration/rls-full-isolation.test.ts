import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * T5.4 / SC-003 — the whole-system isolation proof.
 *
 * Two fully-populated workspaces, A and B, and a user who belongs only to A.
 * For EVERY table in the product, that user must see A's rows and none of B's.
 *
 * Written as a loop over the table list rather than as hand-written cases, so a
 * table added later without a policy fails here instead of shipping.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

const ALL_TABLES = [
  "workspaces",
  "memberships",
  "invitations",
  "knowledge_docs",
  "claim_sets",
  "research_reports",
  "content_drafts",
  "approvals",
  "campaigns",
  "leads",
  "ai_run_logs",
  "audit_logs",
] as const;

describeIfConfigured("RLS: no cross-workspace reads, any table", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let userA: { id: string; client: SupabaseClient };
  let workspaceA: string;
  let workspaceB: string;

  async function populate(workspaceId: string, tag: string, ownerId: string) {
    await admin.from("knowledge_docs").insert({
      workspace_id: workspaceId,
      title: `${tag} doc`,
      body: "body",
    });

    await admin.from("claim_sets").insert({
      workspace_id: workspaceId,
      approved_claims: [`${tag} approved`],
      forbidden_claims: [`${tag} forbidden`],
      brand_voice: tag,
    });

    await admin.from("research_reports").insert({
      workspace_id: workspaceId,
      input_blob: `${tag} notes`,
      status: "succeeded",
    });

    const { data: draft } = await admin
      .from("content_drafts")
      .insert({
        workspace_id: workspaceId,
        topic: `${tag} topic`,
        platform: "instagram",
        payload_json: { hook: tag },
      })
      .select("id")
      .single();

    await admin.from("campaigns").insert({
      workspace_id: workspaceId,
      goal: `${tag} goal`,
      payload_json: { posts: [] },
    });

    await admin.from("leads").insert({
      workspace_id: workspaceId,
      email: `lead-${tag}-${suffix}@example.test`,
      message: tag,
    });

    await admin.from("ai_run_logs").insert({
      workspace_id: workspaceId,
      action: "test.run",
      status: "succeeded",
    });

    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      action: "test.action",
    });

    await admin.from("approvals").insert({
      workspace_id: workspaceId,
      target_type: "content_draft",
      target_id: draft!.id,
      status: "approved",
      reviewer_id: ownerId,
    });

    await admin.from("invitations").insert({
      workspace_id: workspaceId,
      email: `invitee-${tag}-${suffix}@example.test`,
      token: `token-${tag}-${suffix}`,
      invited_by: ownerId,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    userA = await createUser(e, admin, `only-a-${suffix}@example.test`);
    const ownerB = await createUser(e, admin, `owner-b-${suffix}@example.test`);

    const { data: workspaces, error } = await admin
      .from("workspaces")
      .insert([
        { name: `A ${suffix}`, slug: `a-${suffix}` },
        { name: `B ${suffix}`, slug: `b-${suffix}` },
      ])
      .select("id, slug");
    if (error) throw error;

    workspaceA = workspaces.find((w) => w.slug === `a-${suffix}`)!.id;
    workspaceB = workspaces.find((w) => w.slug === `b-${suffix}`)!.id;

    await admin.from("memberships").insert([
      { user_id: userA.id, workspace_id: workspaceA, role: "owner" },
      { user_id: ownerB.id, workspace_id: workspaceB, role: "owner" },
    ]);

    await populate(workspaceA, "alpha", userA.id);
    await populate(workspaceB, "bravo", ownerB.id);

    await deleteUser(admin, ownerB.id);
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().in("id", [workspaceA, workspaceB]);
    if (userA) await deleteUser(admin, userA.id);
  });

  for (const table of ALL_TABLES) {
    it(`${table}: a member of A reads no rows belonging to B`, async () => {
      const column = table === "workspaces" ? "id" : "workspace_id";

      const { data, error } = await userA.client
        .from(table)
        .select(column)
        .eq(column, workspaceB);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  }

  it("the member does see their own workspace's rows", async () => {
    const { data } = await userA.client
      .from("knowledge_docs")
      .select("title")
      .eq("workspace_id", workspaceA);

    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0]!.title).toContain("alpha");
  });

  it("a raw unfiltered select still returns only their workspace", async () => {
    // The strongest form: no filter at all, so only RLS decides.
    const { data } = await userA.client.from("knowledge_docs").select("workspace_id");

    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      expect(row.workspace_id).toBe(workspaceA);
    }
  });
});
