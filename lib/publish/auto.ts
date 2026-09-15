import "server-only";

import { createSupabaseAdminClient } from "@/lib/db/server";
import { executePublishJob, type ExecuteOutcome } from "@/lib/publish/execute";
import { AUTO_RULE_ID } from "@/lib/publish/rules";

/**
 * The auto-within-rules runner (002 T3.4, US5).
 *
 * For each candidate, enqueue_auto_publish_job() applies every rule in the
 * database — mode, plan, toggles, account, claims, window, confidence, cap —
 * and either holds the draft, hands it to a human, or approves it with a
 * rule-attributed approval row and queues an ordinary publish job. That job
 * then goes through executePublishJob(), the same guarded path a human's does.
 */

export type AutoOutcome =
  | { draftId: string; result: "held" | "routed_to_review"; reason: string }
  | { draftId: string; result: "enqueued"; execution: ExecuteOutcome };

export async function runAutoPublish(
  options: { limit?: number; workspaceId?: string } = {},
): Promise<AutoOutcome[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("auto_publish_candidates", {
    p_limit: options.limit ?? 20,
    p_workspace: options.workspaceId ?? null,
  });
  if (error) throw error;

  const outcomes: AutoOutcome[] = [];

  for (const candidate of (data ?? []) as { draft_id: string; account_id: string }[]) {
    try {
      const { data: gate, error: gateError } = await admin.rpc("enqueue_auto_publish_job", {
        p_draft_id: candidate.draft_id,
        p_account_id: candidate.account_id,
        p_rule: AUTO_RULE_ID,
      });
      if (gateError) throw gateError;

      const result = gate as { job_id: string | null; held: string | null; route_to_review: boolean };
      if (!result.job_id) {
        outcomes.push({
          draftId: candidate.draft_id,
          result: result.route_to_review ? "routed_to_review" : "held",
          reason: result.held ?? "held",
        });
        continue;
      }

      outcomes.push({
        draftId: candidate.draft_id,
        result: "enqueued",
        execution: await executePublishJob(result.job_id),
      });
    } catch (runError) {
      console.error(runError);
      outcomes.push({ draftId: candidate.draft_id, result: "held", reason: "the auto runner hit an error" });
    }
  }

  return outcomes;
}
