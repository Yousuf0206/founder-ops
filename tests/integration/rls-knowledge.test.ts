import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * Phase 1 isolation and role gate (T1.1, T1.7).
 *
 * Three users: an editor and a viewer in the workspace, and a stranger outside
 * it. Proves US1 scenario 4 (non-member reads zero) and scenario 5 (a viewer's
 * write is rejected) for knowledge_docs and claim_sets.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured("RLS: knowledge base", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let editor: { id: string; client: SupabaseClient };
  let viewer: { id: string; client: SupabaseClient };
  let stranger: { id: string; client: SupabaseClient };
  let workspaceId: string;
  let docId: string;

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    editor = await createUser(e, admin, `editor-${suffix}@example.test`);
    viewer = await createUser(e, admin, `viewer-${suffix}@example.test`);
    stranger = await createUser(e, admin, `stranger-k-${suffix}@example.test`);

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({ name: `Knowledge WS ${suffix}`, slug: `knowledge-${suffix}` })
      .select("id")
      .single();
    if (error) throw error;
    workspaceId = workspace.id;

    await admin.from("memberships").insert([
      { user_id: editor.id, workspace_id: workspaceId, role: "editor" },
      { user_id: viewer.id, workspace_id: workspaceId, role: "viewer" },
    ]);

    const { data: doc, error: docError } = await admin
      .from("knowledge_docs")
      .insert({ workspace_id: workspaceId, title: "Pricing", body: "Seeded." })
      .select("id")
      .single();
    if (docError) throw docError;
    docId = doc.id;

    await admin.from("claim_sets").insert({
      workspace_id: workspaceId,
      approved_claims: ["Approved thing"],
      forbidden_claims: ["guaranteed admission"],
      brand_voice: "Plain and warm.",
    });
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const user of [editor, viewer, stranger]) {
      if (user) await deleteUser(admin, user.id);
    }
  });

  // --- isolation ----------------------------------------------------------

  it("a non-member reads zero knowledge docs", async () => {
    const { data, error } = await stranger.client.from("knowledge_docs").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member reads zero claim sets", async () => {
    const { data, error } = await stranger.client.from("claim_sets").select("workspace_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a non-member cannot insert a doc into someone else's workspace", async () => {
    const { error } = await stranger.client
      .from("knowledge_docs")
      .insert({ workspace_id: workspaceId, title: "Injected" });
    expect(error).not.toBeNull();
  });

  // --- editor can write ---------------------------------------------------

  it("an editor reads the workspace's docs", async () => {
    const { data, error } = await editor.client.from("knowledge_docs").select("id, title");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.title).toBe("Pricing");
  });

  it("an editor creates a doc", async () => {
    const { data, error } = await editor.client
      .from("knowledge_docs")
      .insert({ workspace_id: workspaceId, title: `Editor doc ${suffix}` })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("an editor updates the claim set", async () => {
    const { error } = await editor.client
      .from("claim_sets")
      .update({ brand_voice: "Edited by editor." })
      .eq("workspace_id", workspaceId);

    expect(error).toBeNull();
  });

  // --- viewer is read-only (US1 scenario 5) -------------------------------

  it("a viewer reads docs", async () => {
    const { data, error } = await viewer.client.from("knowledge_docs").select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("a viewer cannot create a doc", async () => {
    const { error } = await viewer.client
      .from("knowledge_docs")
      .insert({ workspace_id: workspaceId, title: "Viewer doc" });

    expect(error).not.toBeNull();
  });

  it("a viewer cannot update a doc", async () => {
    const { data, error } = await viewer.client
      .from("knowledge_docs")
      .update({ title: "Renamed by viewer" })
      .eq("id", docId)
      .select("id");

    // The UPDATE policy filters the row out: no error, no rows changed.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: check } = await admin
      .from("knowledge_docs")
      .select("title")
      .eq("id", docId)
      .single();
    expect(check!.title).toBe("Pricing");
  });

  it("a viewer cannot delete a doc", async () => {
    const { data, error } = await viewer.client
      .from("knowledge_docs")
      .delete()
      .eq("id", docId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("a viewer cannot update the claim set", async () => {
    const { data, error } = await viewer.client
      .from("claim_sets")
      .update({ forbidden_claims: [] })
      .eq("workspace_id", workspaceId)
      .select("workspace_id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: check } = await admin
      .from("claim_sets")
      .select("forbidden_claims")
      .eq("workspace_id", workspaceId)
      .single();
    expect(check!.forbidden_claims).toContain("guaranteed admission");
  });

  it("nobody can delete a claim set", async () => {
    const { data, error } = await editor.client
      .from("claim_sets")
      .delete()
      .eq("workspace_id", workspaceId)
      .select("workspace_id");

    // No DELETE policy exists, so the row is never visible to the delete.
    expect(error === null ? data : []).toHaveLength(0);
  });

  it("a workspace can hold only one claim set", async () => {
    const { error } = await admin
      .from("claim_sets")
      .insert({ workspace_id: workspaceId, approved_claims: [], forbidden_claims: [] });

    expect(error).not.toBeNull();
  });
});
