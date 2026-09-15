import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient, createUser, deleteUser, testEnv } from "../helpers/supabase";

/**
 * 002 T3.7 / SC-006 — auto-within-rules never exceeds caps, never posts a
 * forbidden claim, and every auto publish carries its rule-attributed approval.
 * Drives enqueue_auto_publish_job() and claim_publish_job() (migrations 0011, 0013).
 */

const env = testEnv();
const describeIfConfigured = env ? describe : describe.skip;

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const todayIsoDay = () => ((new Date().getUTCDay() + 6) % 7) + 1;

describeIfConfigured("auto within rules (0013)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);

  let admin: SupabaseClient;
  let owner: { id: string; client: SupabaseClient };
  let ws: string;
  let account: string;

  async function draft(topic: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from("content_drafts")
      .insert({
        workspace_id: ws,
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

  function autoEnqueue(draftId: string) {
    return admin.rpc("enqueue_auto_publish_job", { p_draft_id: draftId, p_account_id: account });
  }

  async function setWorkspace(values: Record<string, unknown>) {
    const { error } = await admin.from("workspaces").update(values).eq("id", ws);
    if (error) throw error;
  }

  beforeAll(async () => {
    const e = env!;
    admin = adminClient(e);
    owner = await createUser(e, admin, `auto-owner-${suffix}@example.test`);

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({ name: `Auto ${suffix}`, slug: `auto-${suffix}`, plan: "team" })
      .select("id")
      .single();
    if (error) throw error;
    ws = workspace.id;

    await setWorkspace({
      publish_mode: "auto_within_rules",
      auto_enabled: true,
      timezone: "UTC",
      auto_window_start: "00:00",
      auto_window_end: "23:59",
      auto_days: ALL_DAYS,
      daily_publish_cap: 10,
    });

    await admin.from("memberships").insert({ user_id: owner.id, workspace_id: ws, role: "owner" });
    await admin.from("claim_sets").insert({
      workspace_id: ws,
      approved_claims: ["We teach maths"],
      forbidden_claims: ["guaranteed admission"],
    });

    const { data: acct, error: accountError } = await admin
      .from("connected_accounts")
      .insert({
        workspace_id: ws,
        platform: "linkedin",
        external_account_id: `auto-${suffix}`,
        access_token_encrypted: "v1.iv.tag.ct",
        auto_enabled: true,
      })
      .select("id")
      .single();
    if (accountError) throw accountError;
    account = acct.id;
  });

  afterAll(async () => {
    if (!env) return;
    await admin.from("workspaces").delete().eq("id", ws);
    if (owner) await deleteUser(admin, owner.id);
  });

  it("offers qualifying drafts as candidates", async () => {
    const draftId = await draft("candidate");
    const { data, error } = await admin.rpc("auto_publish_candidates", { p_limit: 50, p_workspace: ws });
    expect(error).toBeNull();
    expect((data as { draft_id: string }[]).map((row) => row.draft_id)).toContain(draftId);
  });

  it("publishes a qualifying draft with a rule-attributed approval row (AC1, FR-A-003)", async () => {
    const draftId = await draft("qualifies");
    const { data, error } = await autoEnqueue(draftId);
    expect(error).toBeNull();
    expect(data.job_id).toBeTruthy();

    const { data: approval } = await admin
      .from("approvals")
      .select("status, reviewer_id, decided_by_rule")
      .eq("target_id", draftId)
      .single();
    expect(approval).toEqual({ status: "approved", reviewer_id: null, decided_by_rule: "auto_within_rules" });

    const { data: job } = await admin.from("publish_jobs").select("actor, status, mode").eq("id", data.job_id).single();
    expect(job).toEqual({ actor: "rule:auto_within_rules", status: "queued", mode: "auto_within_rules" });
  });

  it("routes a forbidden claim to a person and never queues it (AC2)", async () => {
    const draftId = await draft("Guaranteed admission, every time");
    const { data } = await autoEnqueue(draftId);

    expect(data.job_id).toBeNull();
    expect(data.route_to_review).toBe(true);

    const { data: row } = await admin.from("content_drafts").select("status, auto_review_reason").eq("id", draftId).single();
    expect(row!.status).toBe("awaiting_approval");
    expect(row!.auto_review_reason).toMatch(/guaranteed admission/i);

    const { data: candidates } = await admin.rpc("auto_publish_candidates", { p_limit: 50, p_workspace: ws });
    expect((candidates as { draft_id: string }[]).map((r) => r.draft_id)).not.toContain(draftId);
  });

  it("never approves more drafts than the cap allows, even concurrently (AC3–AC4)", async () => {
    const { count: queued } = await admin
      .from("publish_jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .eq("status", "queued");
    await setWorkspace({ daily_publish_cap: (queued ?? 0) + 1 });

    const drafts = await Promise.all([draft("race 1"), draft("race 2"), draft("race 3")]);
    const results = await Promise.all(drafts.map((id) => autoEnqueue(id)));

    expect(results.filter((r) => r.error)).toHaveLength(0);
    expect(results.filter((r) => r.data.job_id)).toHaveLength(1);
    expect(results.filter((r) => /cap reached/.test(r.data.held ?? ""))).toHaveLength(2);

    await setWorkspace({ daily_publish_cap: 10 });
  });

  it("holds when the master switch is off (AC7)", async () => {
    await setWorkspace({ auto_enabled: false });
    try {
      const { data } = await autoEnqueue(await draft("switch off"));
      expect(data.held).toMatch(/master auto toggle/);
    } finally {
      await setWorkspace({ auto_enabled: true });
    }
  });

  it("holds for an account not enabled for auto (AC8)", async () => {
    await admin.from("connected_accounts").update({ auto_enabled: false }).eq("id", account);
    try {
      const { data } = await autoEnqueue(await draft("account off"));
      expect(data.held).toMatch(/not enabled for auto/);
    } finally {
      await admin.from("connected_accounts").update({ auto_enabled: true }).eq("id", account);
    }
  });

  it("holds outside the allowed days (AC9)", async () => {
    await setWorkspace({ auto_days: ALL_DAYS.filter((day) => day !== todayIsoDay()) });
    try {
      const { data } = await autoEnqueue(await draft("wrong day"));
      expect(data.held).toMatch(/outside the auto publishing window/);
    } finally {
      await setWorkspace({ auto_days: ALL_DAYS });
    }
  });

  it("applies the confidence gate only when it is on (AC11)", async () => {
    const { data: analysis } = await admin
      .from("analyze_runs")
      .insert({ workspace_id: ws, source_url: "https://example.test", status: "succeeded" })
      .select("id")
      .single();
    const { data: idea } = await admin
      .from("strategy_ideas")
      .insert({
        workspace_id: ws,
        analyze_run_id: analysis!.id,
        title: "low confidence",
        impact: 50,
        effort: 50,
        confidence: 40,
        evidence_refs: [{ source: "analysis", ref: "r", quote: "q" }],
      })
      .select("id")
      .single();

    await setWorkspace({ auto_min_confidence: 60 });
    try {
      const held = await autoEnqueue(await draft("gated", { strategy_idea_id: idea!.id }));
      expect(held.data.held).toMatch(/confidence is below 60/);
    } finally {
      await setWorkspace({ auto_min_confidence: null });
    }

    const passes = await autoEnqueue(await draft("ungated", { strategy_idea_id: idea!.id }));
    expect(passes.data.job_id).toBeTruthy();
  });

  it("holds when the workspace has no approved claims (AC12)", async () => {
    await admin.from("claim_sets").update({ approved_claims: [] }).eq("workspace_id", ws);
    try {
      const { data } = await autoEnqueue(await draft("no claims"));
      expect(data.held).toMatch(/no approved claims/);
    } finally {
      await admin.from("claim_sets").update({ approved_claims: ["We teach maths"] }).eq("workspace_id", ws);
    }
  });

  it("an auto job still meets the cap at execution (Constitution V)", async () => {
    const { data: jobs } = await admin
      .from("publish_jobs")
      .select("id")
      .eq("workspace_id", ws)
      .eq("status", "queued");
    const ids = (jobs ?? []).map((row) => row.id as string);
    expect(ids.length).toBeGreaterThan(1);

    await setWorkspace({ daily_publish_cap: 1 });
    const results = await Promise.all(ids.map((id) => admin.rpc("claim_publish_job", { p_job_id: id })));
    expect(results.filter((r) => r.data?.action === "publish")).toHaveLength(1);
  });
});
