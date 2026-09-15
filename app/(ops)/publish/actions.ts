"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callerCanApprove } from "@/lib/approvals/repo";
import { AuthError, requireSession } from "@/lib/knowledge/repo";
import { cancelPublish, enqueuePublish, PublishRefusedError, retryPublish } from "@/lib/publish/enqueue";
import { runAutoPublish } from "@/lib/publish/auto";
import { executePublishJob, runDuePublishJobs, type ExecuteOutcome } from "@/lib/publish/execute";

export type PublishState = { error?: string; done?: string };

function messageFor(error: unknown): string {
  if (error instanceof AuthError || error instanceof PublishRefusedError) return error.message;
  console.error(error);
  return "Something went wrong. Try again.";
}

function describe(outcome: ExecuteOutcome): PublishState {
  switch (outcome.result) {
    case "published":
      return { done: "Published." };
    case "reconciled":
      return { done: "Already published — the stored receipt was confirmed." };
    case "blocked":
      return { error: `Blocked: ${outcome.message}` };
    case "failed":
      return { error: `Publishing failed: ${outcome.message}` };
    default:
      return { error: `Nothing was published: ${outcome.message ?? "the job was not due"}.` };
  }
}

function refresh(draftId?: string) {
  revalidatePath("/publish");
  revalidatePath("/content");
  if (draftId) revalidatePath(`/content/${draftId}`);
}

const publishSchema = z.object({
  draft_id: z.string().uuid(),
  account_id: z.string().uuid({ message: "Choose an account." }),
  when: z.enum(["now", "schedule"]),
  scheduled_for: z.string().optional(),
});

/** US4 AC3–AC4: an approved draft is published now, or scheduled for later. */
export async function publishDraftAction(_prev: PublishState, formData: FormData): Promise<PublishState> {
  const parsed = publishSchema.safeParse({
    draft_id: formData.get("draft_id"),
    account_id: formData.get("account_id"),
    when: formData.get("when"),
    scheduled_for: formData.get("scheduled_for") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const { draft_id, account_id, when, scheduled_for } = parsed.data;

  let scheduledFor: Date | undefined;
  if (when === "schedule") {
    scheduledFor = scheduled_for ? new Date(scheduled_for) : undefined;
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) return { error: "Choose a date and time." };
  }

  try {
    const session = await requireSession();
    const { jobId } = await enqueuePublish(session, { draftId: draft_id, accountId: account_id, scheduledFor });

    if (when === "schedule") {
      refresh(draft_id);
      return { done: `Scheduled for ${scheduledFor!.toUTCString()}.` };
    }

    const outcome = await executePublishJob(jobId);
    refresh(draft_id);
    return describe(outcome);
  } catch (error) {
    return { error: messageFor(error) };
  }
}

const jobSchema = z.object({ job_id: z.string().uuid() });

/**
 * FR-Q-107 is open, so retries are human-triggered only. The same job id is
 * reused, which never double-counts the cap.
 */
export async function retryJobAction(formData: FormData): Promise<void> {
  const parsed = jobSchema.safeParse({ job_id: formData.get("job_id") });
  if (!parsed.success) return;

  try {
    await requireSession();
    await retryPublish(parsed.data.job_id);
    await executePublishJob(parsed.data.job_id);
  } catch (error) {
    messageFor(error);
  }
  refresh();
}

export async function cancelJobAction(formData: FormData): Promise<void> {
  const parsed = jobSchema.safeParse({ job_id: formData.get("job_id") });
  if (!parsed.success) return;

  try {
    await requireSession();
    await cancelPublish(parsed.data.job_id);
  } catch (error) {
    messageFor(error);
  }
  refresh();
}

/**
 * B1 fallback: without frequent cron, a reviewer runs this workspace's auto
 * rules and due jobs by hand. Same guarded path as the cron runner.
 */
export async function runDueNowAction(): Promise<void> {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  if (!(await callerCanApprove(workspaceId))) return;

  await runAutoPublish({ workspaceId, limit: 20 });
  await runDuePublishJobs({ workspaceId, limit: 20 });
  refresh();
}
