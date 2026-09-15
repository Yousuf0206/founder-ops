import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * 002 T2.15 — the publish path in the database (migrations 0010–0012).
 * No platform is called: these tests drive the enqueue / claim / finish
 * functions directly, which is where every guarantee lives.
 *
 * US4 AC3–7, FR-P-004a/b, FR-P-005..007, FR-P-010, decisions §5, §7, §8.
 * Tests run in order and share state; each names what it relies on.
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured("publish path (0010–0012)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let owner: { id: string; client: SupabaseClient };
  let editor: { id: string; client: SupabaseClient };
  let wsA: string;
  let wsB: string;
  let accountA: string;
  let accountB: string;

  // Shared between the cap, retry, and receipt tests.
  let publishingJob: string;
  let blockedJobs: string[] = [];

  async function draft(topic: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from("content_drafts")
      .insert({
        workspace_id: wsA,
        topic,
        platform: "linkedin",
        payload_json: { hook: topic, script: "We teach maths." },
        ...overrides,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function approvedDraft(topic: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const id = await draft(topic, overrides);
    const { error } = await owner.client.rpc("decide_on_draft", {
      draft_id: id,
      decision: "approved",
      edited_payload: null,
      reviewer_notes: "",
    });
    if (error) throw error;
    return id;
  }

  function enqueue(client: SupabaseClient, draftId: string, accountId = accountA, scheduledFor: string | null = null) {
    return client.rpc("enqueue_publish_job", {
      p_draft_id: draftId,
      p_account_id: accountId,
      p_scheduled_for: scheduledFor,
    });
  }

  async function job(id: string) {
    const { data, error } = await admin.from("publish_jobs").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);
    owner = await createUser(e, admin, `pub-owner-${suffix}@example.test`);
    editor = await createUser(e, admin, `pub-editor-${suffix}@example.test`);

    const { data: workspaces, error } = await admin
      .from("workspaces")
      .insert([
        { name: `Pub A ${suffix}`, slug: `pub-a-${suffix}` },
        { name: `Pub B ${suffix}`, slug: `pub-b-${suffix}` },
      ])
      .select("id, slug");
    if (error) throw error;
    wsA = workspaces.find((w) => w.slug === `pub-a-${suffix}`)!.id;
    wsB = workspaces.find((w) => w.slug === `pub-b-${suffix}`)!.id;

    const { error: memberError } = await admin.from("memberships").insert([
      { user_id: owner.id, workspace_id: wsA, role: "owner" },
      { user_id: editor.id, workspace_id: wsA, role: "editor" },
    ]);
    if (memberError) throw memberError;

    const { error: claimError } = await admin.from("claim_sets").insert([
      { workspace_id: wsA, approved_claims: ["We teach maths"], forbidden_claims: ["guaranteed admission"] },
      { workspace_id: wsB, approved_claims: ["We teach maths"], forbidden_claims: [] },
    ]);
    if (claimError) throw claimError;

    const { data: accounts, error: accountError } = await admin
      .from("connected_accounts")
      .insert([
        { workspace_id: wsA, platform: "linkedin", external_account_id: `a-${suffix}`, display_name: "A", access_token_encrypted: "v1.iv.tag.ct" },
        { workspace_id: wsB, platform: "linkedin", external_account_id: `b-${suffix}`, display_name: "B", access_token_encrypted: "v1.iv.tag.ct" },
      ])
      .select("id, workspace_id");
    if (accountError) throw accountError;
    accountA = accounts.find((a) => a.workspace_id === wsA)!.id;
    accountB = accounts.find((a) => a.workspace_id === wsB)!.id;
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().in("id", [wsA, wsB]);
    for (const user of [owner, editor]) if (user) await deleteUser(admin, user.id);
  });

  it("an approved draft enqueues, attributed to its reviewer, with the claim check recorded", async () => {
    const draftId = await approvedDraft("clean post");
    const { data, error } = await enqueue(owner.client, draftId);

    expect(error).toBeNull();
    expect(data.refused).toBeNull();

    const row = await job(data.job_id);
    expect(row.actor).toBe(`user:${owner.id}`);
    expect(row.status).toBe("queued");
    expect(row.mode).toBe("approve_then_publish");
    expect(row.claim_check.passed).toBe(true);
  });

  it("a draft that is not approved is refused", async () => {
    const { data } = await enqueue(owner.client, await draft("unapproved"));
    expect(data.refused).toMatch(/only an approved draft/i);
  });

  it("an account belonging to another workspace is refused (FR-P-007)", async () => {
    const { data } = await enqueue(owner.client, await approvedDraft("foreign"), accountB);
    expect(data.refused).toMatch(/not connected to this workspace/i);
  });

  it("an editor without approval rights cannot enqueue (US4 AC6)", async () => {
    const draftId = await approvedDraft("editor tries");
    const { error } = await enqueue(editor.client, draftId);
    expect(error?.message).toMatch(/approval rights/i);
  });

  it("a draft written for another platform is refused", async () => {
    const { data } = await enqueue(owner.client, await approvedDraft("wrong platform", { platform: "instagram" }));
    expect(data.refused).toMatch(/written for/i);
  });

  it("a forbidden claim added in the reviewer's edit is refused and audited (FR-P-006)", async () => {
    const draftId = await draft("edited in");
    const { error: decideError } = await owner.client.rpc("decide_on_draft", {
      draft_id: draftId,
      decision: "edited_and_approved",
      edited_payload: { hook: "Guaranteed Admission for every student", script: "x" },
      reviewer_notes: "",
    });
    expect(decideError).toBeNull();

    const { data } = await enqueue(owner.client, draftId);
    expect(data.refused).toMatch(/forbidden claims: guaranteed admission/i);

    const { data: audit } = await admin
      .from("audit_logs")
      .select("action")
      .eq("target_id", draftId)
      .eq("action", "publish.refused");
    expect(audit).toHaveLength(1);
  });

  it("draft_only mode refuses to publish", async () => {
    await admin.from("workspaces").update({ publish_mode: "draft_only" }).eq("id", wsA);
    try {
      const { data } = await enqueue(owner.client, await approvedDraft("draft only"));
      expect(data.refused).toMatch(/draft_only/);
    } finally {
      await admin.from("workspaces").update({ publish_mode: "approve_then_publish" }).eq("id", wsA);
    }
  });

  it("the daily publish cap holds under concurrent execution (FR-P-005)", async () => {
    await admin.from("workspaces").update({ daily_publish_cap: 1 }).eq("id", wsA);

    const jobIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { data, error } = await enqueue(owner.client, await approvedDraft(`race ${i}`));
      expect(error).toBeNull();
      jobIds.push(data.job_id);
    }

    const results = await Promise.all(jobIds.map((id) => admin.rpc("claim_publish_job", { p_job_id: id })));
    expect(results.filter((r) => r.error)).toHaveLength(0);

    const started = jobIds.filter((_, i) => results[i]!.data.action === "publish");
    blockedJobs = jobIds.filter((_, i) => results[i]!.data.action === "blocked");

    expect(started).toHaveLength(1);
    expect(blockedJobs).toHaveLength(3);
    publishingJob = started[0]!;

    expect((await job(blockedJobs[0]!)).platform_error).toMatch(/daily publish cap reached/i);
  });

  it("a retry reuses the same job and never counts against the cap twice (FR-P-004b)", async () => {
    const failed = await admin.rpc("finish_publish_job", {
      p_job_id: publishingJob,
      p_published: false,
      p_error: "platform timeout",
    });
    expect(failed.error).toBeNull();

    const retry = await owner.client.rpc("request_publish_retry", { p_job_id: publishingJob });
    expect(retry.error).toBeNull();

    // The cap of 1 is already used — by this very job — so it must still run.
    const claim = await admin.rpc("claim_publish_job", { p_job_id: publishingJob });
    expect(claim.data.action).toBe("publish");
    expect((await job(publishingJob)).attempt_count).toBe(2);

    const { count } = await admin
      .from("publish_jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsA)
      .eq("cap_counted", true);
    expect(count).toBe(1);
  });

  it("a finished job stores its receipt and marks the draft published", async () => {
    const finish = await admin.rpc("finish_publish_job", {
      p_job_id: publishingJob,
      p_published: true,
      p_external_id: `urn:li:share:${suffix}`,
      p_permalink: "https://www.linkedin.com/feed/update/test/",
    });
    expect(finish.error).toBeNull();

    const row = await job(publishingJob);
    expect(row.status).toBe("published");
    expect(row.external_id).toBe(`urn:li:share:${suffix}`);

    const { data: draftRow } = await admin.from("content_drafts").select("status").eq("id", row.draft_id).single();
    expect(draftRow!.status).toBe("published");
  });

  it("a job with a stored receipt reconciles instead of posting again (FR-P-010)", async () => {
    const target = blockedJobs[0]!;
    expect((await owner.client.rpc("request_publish_retry", { p_job_id: target })).error).toBeNull();
    await admin.from("publish_jobs").update({ external_id: `urn:li:share:recovered-${suffix}` }).eq("id", target);

    const claim = await admin.rpc("claim_publish_job", { p_job_id: target });
    expect(claim.data.action).toBe("reconciled");
    expect((await job(target)).status).toBe("published");
  });

  it("an attempt that never reported back is marked unknown, never re-posted (decisions §8)", async () => {
    await admin.from("workspaces").update({ daily_publish_cap: 5 }).eq("id", wsA);
    const { data } = await enqueue(owner.client, await approvedDraft("lost response"));
    expect((await admin.rpc("claim_publish_job", { p_job_id: data.job_id })).data.action).toBe("publish");

    await admin
      .from("publish_jobs")
      .update({ last_attempt_at: new Date(Date.now() - 20 * 60_000).toISOString() })
      .eq("id", data.job_id);

    const claim = await admin.rpc("claim_publish_job", { p_job_id: data.job_id });
    expect(claim.data.action).toBe("skip");

    const row = await job(data.job_id);
    expect(row.status).toBe("failed");
    expect(row.platform_error).toMatch(/unknown whether the post went out/i);
  });

  it("disconnecting an account blocks its scheduled jobs and discards its tokens (US2 AC5)", async () => {
    const { data: account } = await admin
      .from("connected_accounts")
      .insert({ workspace_id: wsA, platform: "linkedin", external_account_id: `c-${suffix}`, access_token_encrypted: "v1.iv.tag.ct" })
      .select("id")
      .single();

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const { data } = await enqueue(owner.client, await approvedDraft("scheduled"), account!.id, tomorrow);
    expect((await job(data.job_id)).status).toBe("scheduled");

    const revoke = await owner.client.rpc("revoke_connected_account", { p_account_id: account!.id });
    expect(revoke.error).toBeNull();
    expect(revoke.data).toBe(1);

    expect((await job(data.job_id)).status).toBe("blocked");
    const { data: after } = await admin
      .from("connected_accounts")
      .select("access_token_encrypted, status")
      .eq("id", account!.id)
      .single();
    expect(after).toEqual({ access_token_encrypted: null, status: "revoked" });
  });

  it("a signed-in member cannot read token columns (NFR-005)", async () => {
    const secret = await owner.client.from("connected_accounts").select("access_token_encrypted").eq("workspace_id", wsA);
    expect(secret.error).not.toBeNull();

    const visible = await owner.client.from("connected_accounts").select("id, display_name").eq("workspace_id", wsA);
    expect(visible.error).toBeNull();
    expect((visible.data ?? []).length).toBeGreaterThan(0);
  });

  it("a member of another workspace reads none of its publish jobs", async () => {
    const outsider = await createUser(env!, admin, `pub-outsider-${suffix}@example.test`);
    try {
      const { data, error } = await outsider.client.from("publish_jobs").select("id").eq("workspace_id", wsA);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    } finally {
      await deleteUser(admin, outsider.id);
    }
  });
});
