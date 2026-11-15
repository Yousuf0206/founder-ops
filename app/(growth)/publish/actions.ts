"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callerCanApprove, decideOnDraft } from "@/lib/approvals/repo";
import { canWrite, getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { AuthError } from "@/lib/knowledge/repo";
import { enqueuePublish, PublishRefusedError, retryPublish } from "@/lib/publish/enqueue";
import { executePublishJob, type ExecuteOutcome } from "@/lib/publish/execute";
import { isPublishablePlatform } from "@/lib/growth/pack";
import { errorClass, errorKind, logEvent } from "@/lib/obs/log";

/**
 * The Instant publish actions (004 T-4.3).
 *
 * Deliberately thin. Every guarantee the milestone cares about — the claim and
 * forbidden check on the *final* body, the daily cap, approval rights, one job
 * per draft per account — lives in `enqueue_publish_job()` in the database and
 * in `executePublishJob()`. Re-implementing any of it here would mean the
 * Instant path and the ops board could disagree about what is allowed, which is
 * precisely the failure constitution R7 exists to prevent.
 *
 * So this file does three things: check the caller may act, call the existing
 * path, and turn the outcome into a sentence a founder can read.
 */

export type InstantPublishState = { error?: string; done?: string };

function messageFor(error: unknown): string {
  if (error instanceof AuthError || error instanceof PublishRefusedError) return error.message;
  console.error(error);
  return "Something went wrong. Try again.";
}

function describe(outcome: ExecuteOutcome): InstantPublishState {
  switch (outcome.result) {
    case "published":
      return { done: "Published. The receipt is below." };
    case "reconciled":
      return { done: "That post was already live — the existing receipt was confirmed." };
    case "blocked":
      // A safety refusal, not a bug: the body hit a forbidden pattern or the cap.
      return { error: `Held back: ${outcome.message}` };
    case "failed":
      return { error: `Publishing failed: ${outcome.message}` };
    default:
      return { error: `Nothing was published: ${outcome.message ?? "the job was not due"}.` };
  }
}

function refresh() {
  revalidatePath("/publish");
  revalidatePath("/next");
  revalidatePath("/results");
  // The ops board shows the same jobs.
  revalidatePath("/advanced/publish");
}

const draftSchema = z.object({ draft_id: z.string().uuid() });
const publishSchema = z.object({
  draft_id: z.string().uuid(),
  account_id: z.string().uuid({ message: "Connect a channel first." }),
});
const jobSchema = z.object({ job_id: z.string().uuid() });

/**
 * Approve one post (SC-05 step 2).
 *
 * Approval is a human act with its own audit row — `decide_on_draft()` writes
 * the status, the preserved original, the approval and the audit entry in one
 * transaction, so an approved post without a named approver cannot exist.
 */
export async function approvePostAction(
  _prev: InstantPublishState,
  formData: FormData,
): Promise<InstantPublishState> {
  const parsed = draftSchema.safeParse({ draft_id: formData.get("draft_id") });
  if (!parsed.success) return { error: "That post could not be identified." };

  try {
    const session = await getOpsSession();
    if (!session) return { error: "Your session expired. Sign in and try again." };
    if (!(await callerCanApprove(session.activeWorkspace.workspaceId))) {
      return { error: "You do not have approval rights in this workspace. Ask an owner." };
    }

    await decideOnDraft({ draftId: parsed.data.draft_id, decision: "approved" });
  } catch (error) {
    return { error: messageFor(error) };
  }

  refresh();
  return { done: "Approved. Publish it when you are ready." };
}

/**
 * Publish one approved post now (SC-05 step 3).
 *
 * Enqueue then execute, the same two steps the ops board takes: the enqueue is
 * where the database re-checks the final body, the account and the cap, and the
 * execute is the only code path allowed to call a connector.
 */
export async function publishPostAction(
  _prev: InstantPublishState,
  formData: FormData,
): Promise<InstantPublishState> {
  const parsed = publishSchema.safeParse({
    draft_id: formData.get("draft_id"),
    account_id: formData.get("account_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That post could not be published." };
  }

  const startedAt = Date.now();
  let workspaceId: string | null = null;

  try {
    const session = await getOpsSession();
    if (!session) return { error: "Your session expired. Sign in and try again." };
    if (!canWrite(session.activeWorkspace.role)) {
      return { error: "Viewers cannot publish." };
    }
    workspaceId = session.activeWorkspace.workspaceId;

    // The platform gate, re-checked server-side: a hidden input is not a
    // permission. Instagram posts exist as drafts and must stay that way until
    // the Meta connector is live (FR-07).
    const supabase = await createSupabaseServerClient();
    const { data: draft } = await supabase
      .from("content_drafts")
      .select("platform")
      .eq("id", parsed.data.draft_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!draft) return { error: "That post is no longer in this workspace." };
    if (!isPublishablePlatform(draft.platform)) {
      return {
        error: `${draft.platform} publishing is not live yet. Copy the post out by hand for now.`,
      };
    }

    const { jobId } = await enqueuePublish(session, {
      draftId: parsed.data.draft_id,
      accountId: parsed.data.account_id,
    });
    const outcome = await executePublishJob(jobId);

    logEvent({
      event: "growth.publish",
      outcome: outcome.result === "published" || outcome.result === "reconciled" ? "ok" : "error",
      latencyMs: Date.now() - startedAt,
      runId: jobId,
      workspaceId,
      errorClass: outcome.result === "published" ? null : outcome.result,
    });

    refresh();
    return describe(outcome);
  } catch (error) {
    logEvent({
      event: "growth.publish",
      outcome: "error",
      latencyMs: Date.now() - startedAt,
      workspaceId,
      errorClass: errorClass(error),
      errorKind: errorKind(error),
    });
    return { error: messageFor(error) };
  }
}

/**
 * Retry a failed or blocked job.
 *
 * Reuses the same job id, which is what keeps a retry from double-posting and
 * from double-counting the cap (FR-08): the stored receipt is reconciled rather
 * than a second post created.
 */
export async function retryPublishAction(
  _prev: InstantPublishState,
  formData: FormData,
): Promise<InstantPublishState> {
  const parsed = jobSchema.safeParse({ job_id: formData.get("job_id") });
  if (!parsed.success) return { error: "That attempt could not be identified." };

  try {
    const session = await getOpsSession();
    if (!session) return { error: "Your session expired. Sign in and try again." };
    if (!canWrite(session.activeWorkspace.role)) return { error: "Viewers cannot publish." };

    await retryPublish(parsed.data.job_id);
    const outcome = await executePublishJob(parsed.data.job_id);
    refresh();
    return describe(outcome);
  } catch (error) {
    return { error: messageFor(error) };
  }
}
