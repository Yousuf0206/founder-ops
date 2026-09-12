import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * T2.8 / T2.10 — the cap holds, including at the boundary and under concurrency.
 * T3.7 / T3.8 / T3.9 — approval authority, audit on every decision, both payloads kept.
 * US6 scenario 3 — approving a campaign sends nothing.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured("AI run cap", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const CAP = 3;

  let admin: SupabaseClient;
  let member: { id: string; client: SupabaseClient };
  let workspaceId: string;

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);
    member = await createUser(e, admin, `capper-${suffix}@example.test`);

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({ name: `Cap WS ${suffix}`, slug: `cap-${suffix}`, daily_run_cap: CAP })
      .select("id")
      .single();
    if (error) throw error;
    workspaceId = workspace.id;

    await admin
      .from("memberships")
      .insert({ user_id: member.id, workspace_id: workspaceId, role: "owner" });
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    if (member) await deleteUser(admin, member.id);
  });

  it("allows exactly `cap` runs, then refuses", async () => {
    for (let i = 0; i < CAP; i += 1) {
      const { data, error } = await member.client.rpc("claim_ai_run", {
        target_workspace: workspaceId,
        run_action: "test.run",
        run_model: "test-model",
      });
      expect(error, `run ${i + 1} should be allowed`).toBeNull();
      expect(data).toBeTruthy();
    }

    // Refusal is a null return, not an exception: raising would roll back the
    // 'refused' row the next test asserts on.
    const { data, error } = await member.client.rpc("claim_ai_run", {
      target_workspace: workspaceId,
      run_action: "test.run",
      run_model: "test-model",
    });

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("records the refusal so the cap is visible in the trail", async () => {
    const { data } = await admin
      .from("ai_run_logs")
      .select("status, error")
      .eq("workspace_id", workspaceId)
      .eq("status", "refused");

    const rows = data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    // The row carries the counts; lib/ai/run.ts reads this back as the
    // CapReachedError message.
    expect(rows[0]?.error).toMatch(/cap reached \(\d+ of \d+ runs used today\)/);
  });

  it("refused runs do not themselves consume the cap", async () => {
    const { data: counted } = await admin
      .from("ai_run_logs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .neq("status", "refused");

    expect(counted).toHaveLength(CAP);
  });

  it("holds under concurrent claims at the boundary", async () => {
    // Fresh workspace so the count starts clean.
    const { data: workspace } = await admin
      .from("workspaces")
      .insert({
        name: `Race WS ${suffix}`,
        slug: `race-${suffix}`,
        daily_run_cap: 2,
      })
      .select("id")
      .single();

    await admin
      .from("memberships")
      .insert({ user_id: member.id, workspace_id: workspace!.id, role: "owner" });

    // Ten simultaneous claims against a cap of two.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        member.client.rpc("claim_ai_run", {
          target_workspace: workspace!.id,
          run_action: "race.run",
          run_model: null,
        }),
      ),
    );

    const granted = results.filter((r) => r.data !== null).length;
    expect(granted).toBe(2);
    expect(results.filter((r) => r.error !== null)).toHaveLength(0);

    await admin.from("workspaces").delete().eq("id", workspace!.id);
  });
});

describeIfConfigured("approvals", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let owner: { id: string; client: SupabaseClient };
  let editor: { id: string; client: SupabaseClient };
  let workspaceId: string;
  let editorMembershipId: string;

  async function newDraft(topic: string): Promise<string> {
    const { data, error } = await admin
      .from("content_drafts")
      .insert({
        workspace_id: workspaceId,
        topic,
        platform: "instagram",
        payload_json: { hook: "original hook", script: "original script" },
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);

    owner = await createUser(e, admin, `ap-owner-${suffix}@example.test`);
    editor = await createUser(e, admin, `ap-editor-${suffix}@example.test`);

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({ name: `Approve WS ${suffix}`, slug: `approve-${suffix}` })
      .select("id")
      .single();
    if (error) throw error;
    workspaceId = workspace.id;

    await admin
      .from("memberships")
      .insert({ user_id: owner.id, workspace_id: workspaceId, role: "owner" });

    const { data: membership } = await admin
      .from("memberships")
      .insert({ user_id: editor.id, workspace_id: workspaceId, role: "editor" })
      .select("id")
      .single();
    editorMembershipId = membership!.id;
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const user of [owner, editor]) if (user) await deleteUser(admin, user.id);
  });

  it("a draft cannot be born approved (Constitution I)", async () => {
    const { error } = await admin.from("content_drafts").insert({
      workspace_id: workspaceId,
      topic: "sneaky",
      platform: "x",
      payload_json: {},
      status: "approved",
    });

    expect(error).not.toBeNull();
  });

  it("an editor without the grant cannot approve (FR-Q-001)", async () => {
    const draftId = await newDraft("editor tries");
    const { error } = await editor.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "approved",
      edited_payload: null,
      reviewer_notes: "",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/approval rights/i);
  });

  it("an editor with the grant can approve", async () => {
    await admin
      .from("memberships")
      .update({ can_approve: true })
      .eq("id", editorMembershipId);

    const draftId = await newDraft("editor granted");
    const { error } = await editor.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "approved",
      edited_payload: null,
      reviewer_notes: "looks right",
    });

    expect(error).toBeNull();
  });

  it("every decision writes an audit row (SC-006)", async () => {
    const draftId = await newDraft("audited");
    await owner.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "rejected",
      edited_payload: null,
      reviewer_notes: "off-brand",
    });

    const { data } = await admin
      .from("audit_logs")
      .select("action")
      .eq("workspace_id", workspaceId)
      .eq("target_id", draftId);

    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0]!.action).toContain("approval.");
  });

  it("edit-and-approve keeps both the original and the edit (T3.9)", async () => {
    const draftId = await newDraft("edited");

    const { error } = await owner.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "edited_and_approved",
      edited_payload: { hook: "human hook", script: "human script" },
      reviewer_notes: "rewrote the hook",
    });
    expect(error).toBeNull();

    const { data: draft } = await admin
      .from("content_drafts")
      .select("payload_json, original_payload, status")
      .eq("id", draftId)
      .single();

    expect(draft!.status).toBe("approved");
    expect((draft!.payload_json as { hook: string }).hook).toBe("human hook");
    expect((draft!.original_payload as { hook: string }).hook).toBe("original hook");
  });

  it("a draft cannot be decided twice", async () => {
    const draftId = await newDraft("twice");
    await owner.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "approved",
      edited_payload: null,
      reviewer_notes: "",
    });

    const { error } = await owner.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "rejected",
      edited_payload: null,
      reviewer_notes: "",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already been decided/i);
  });

  it("only an approved draft can be marked published", async () => {
    const draftId = await newDraft("not approved yet");
    const { error } = await owner.client.rpc("mark_draft_published", {
      draft_id: draftId,
    });

    expect(error).not.toBeNull();
  });

  it("a client cannot set status directly, bypassing the decision path", async () => {
    const draftId = await newDraft("direct update");
    const { data, error } = await owner.client
      .from("content_drafts")
      .update({ status: "approved" })
      .eq("id", draftId)
      .select("id");

    // No UPDATE policy exists on content_drafts.
    expect(error === null ? data : []).toHaveLength(0);
  });

  it("approving a campaign with an email draft sends nothing (US6 scenario 3)", async () => {
    const { data: campaign } = await admin
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        goal: "launch",
        payload_json: {
          email_draft: { subject: "Hello", body: "Body" },
          posts: [],
          positioning_options: [],
          experiment: {},
        },
      })
      .select("id")
      .single();

    const { error } = await owner.client.rpc("decide_on_campaign", {
      campaign_id: campaign!.id,
      decision: "approved",
      reviewer_notes: "",
    });
    expect(error).toBeNull();

    // The audit row asserts it, and no send path exists to assert against.
    const { data: audit } = await admin
      .from("audit_logs")
      .select("meta")
      .eq("target_id", campaign!.id)
      .single();

    expect((audit!.meta as { sent_nothing: boolean }).sent_nothing).toBe(true);
  });
});
