import "server-only";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";
import { UnparseableOutputError } from "@/lib/ai/research";
import { flattenText } from "@/lib/strategy/score";
import { learnOutputSchema, validateLearnOutput, type LearnOutput } from "@/lib/learn/evidence";

/**
 * The learn agent (002 US6, FR-LRN-002..004). On demand only — FR-Q-106 (the
 * weekly trigger) is open. It proposes knowledge edits and never applies them:
 * proposals are stored pending until a human accepts one.
 */

const LEARN_ROLE = `You review a workspace's recently published posts and report what worked.

You are given each post's id, platform, topic, text, and whatever performance data exists. Where performance data is not available, say so and do not infer performance from the text alone — describe patterns in what was published instead, clearly labelled as such.

Produce:
- what_worked: findings, each citing the post ids it rests on (evidence_job_ids).
- suggested_topics: next topics, each with why, citing the posts that suggest it.
- knowledge_proposals: at most 3 proposed edits to the claim set, each "approved_claim_add" or "forbidden_claim_add", with rationale and cited posts. Propose an approved claim ONLY if it is already stated in the approved claims above or directly shown by the evidence; never invent a product fact. These are suggestions a human will review.

Use only the post ids you were given. Return ONLY valid JSON:
{"what_worked":[{"finding":"...","evidence_job_ids":["..."]}],"suggested_topics":[{"topic":"...","why":"...","evidence_job_ids":["..."]}],"knowledge_proposals":[{"kind":"approved_claim_add|forbidden_claim_add","text":"...","rationale":"...","evidence_job_ids":["..."]}]}`;

export const LEARN_PERIOD_DAYS = 30;

export class NothingPublishedError extends Error {
  constructor() {
    super(`Nothing was published in the last ${LEARN_PERIOD_DAYS} days, so there is nothing to learn from yet.`);
    this.name = "NothingPublishedError";
  }
}

type JobRow = {
  id: string;
  platform: string;
  body_snapshot: unknown;
  created_at: string;
  content_drafts: { topic: string } | null;
};

export async function runLearnSummary(session: OpsSession): Promise<{ summaryId: string; proposals: number }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - LEARN_PERIOD_DAYS * 86_400_000);

  const { data, error } = await supabase
    .from("publish_jobs")
    .select("id, platform, body_snapshot, created_at, content_drafts (topic)")
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .gte("created_at", periodStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;

  const jobs = (data ?? []) as unknown as JobRow[];
  // Checked before a run is reserved: an empty report costs nothing.
  if (jobs.length === 0) throw new NothingPublishedError();

  const { data: snapshots } = await supabase
    .from("performance_snapshots")
    .select("publish_job_id, available, metrics, note, fetched_at")
    .eq("workspace_id", workspaceId)
    .in("publish_job_id", jobs.map((job) => job.id))
    .order("fetched_at", { ascending: false });

  const latest = new Map<string, { available: boolean; metrics: unknown; note: string }>();
  for (const snapshot of snapshots ?? []) {
    if (!latest.has(snapshot.publish_job_id)) latest.set(snapshot.publish_job_id, snapshot);
  }

  const prompt = jobs
    .map((job) => {
      const snapshot = latest.get(job.id);
      const performance = snapshot?.available
        ? `performance: ${JSON.stringify(snapshot.metrics)}`
        : `performance: not available${snapshot?.note ? ` (${snapshot.note})` : ""}`;
      return [
        `<post id="${job.id}" platform="${job.platform}" published="${job.created_at}">`,
        `topic: ${job.content_drafts?.topic ?? "unknown"}`,
        performance,
        flattenText(job.body_snapshot),
        "</post>",
      ].join("\n");
    })
    .join("\n\n");

  const { runId, result } = await runGeneration({
    session,
    action: "learn.summary",
    role: LEARN_ROLE,
    userPrompt: prompt,
    jsonMode: true,
  });

  let output: LearnOutput;
  try {
    const fenced = result.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    output = learnOutputSchema.parse(JSON.parse((fenced?.[1] ?? result.text).trim()));
  } catch {
    throw new UnparseableOutputError(result.text);
  }

  const known = new Set(jobs.map((job) => job.id));
  const valid = validateLearnOutput(output, known);

  const { data: summary, error: summaryError } = await supabase
    .from("learn_summaries")
    .insert({
      workspace_id: workspaceId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      what_worked: valid.what_worked,
      suggested_topics: valid.suggested_topics,
      evidence_job_ids: [...known],
      run_id: runId,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (summaryError) throw summaryError;

  if (valid.knowledge_proposals.length > 0) {
    const { error: proposalError } = await supabase.from("knowledge_proposals").insert(
      valid.knowledge_proposals.slice(0, 3).map((proposal) => ({
        workspace_id: workspaceId,
        summary_id: summary.id,
        kind: proposal.kind,
        proposed_text: proposal.text,
        rationale: proposal.rationale,
        evidence_job_ids: proposal.evidence_job_ids,
      })),
    );
    if (proposalError) throw proposalError;
  }

  await writeAudit(workspaceId, "learn.summary_created", "learn_summary", summary.id, {
    posts: jobs.length,
    findings: valid.what_worked.length,
    topics: valid.suggested_topics.length,
    proposals: Math.min(valid.knowledge_proposals.length, 3),
    dropped_uncited:
      output.what_worked.length +
      output.suggested_topics.length +
      output.knowledge_proposals.length -
      (valid.what_worked.length + valid.suggested_topics.length + valid.knowledge_proposals.length),
  });

  return { summaryId: summary.id, proposals: Math.min(valid.knowledge_proposals.length, 3) };
}
