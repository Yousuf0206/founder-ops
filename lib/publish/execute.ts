import "server-only";

import { contentPayloadSchema, type ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";
import { publishToLinkedIn } from "@/lib/connectors/linkedin/publish";
import { decryptToken, TokenDecryptError, tokenContext } from "@/lib/connectors/tokens";
import { createSupabaseAdminClient } from "@/lib/db/server";
import { isEmailConfigured, notifyTeamMember } from "@/lib/email/notify";

/**
 * THE only path to a platform write (002 T2.8, FR-P-009).
 * scripts/check-publish-guards.mjs fails the build if any other module imports
 * a connector's publish function.
 *
 * Order, every time, in every mode:
 *   1. claim_publish_job()  — re-checks account, mode, claims on the final body,
 *                             and reserves the publish cap under a lock
 *   2. decrypt the token    — here and nowhere else
 *   3. the platform call
 *   4. finish_publish_job() — the receipt (idempotency anchor) or the error
 *
 * Runs with the service role because the cron runner has no session. It never
 * takes a body or target from its caller — only a job id, whose contents were
 * fixed when a reviewer (or, in Phase 3, a rule) enqueued it.
 */

export type ExecuteOutcome = {
  jobId: string;
  result: "published" | "failed" | "blocked" | "skipped" | "reconciled";
  message?: string;
  permalink?: string;
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;

type PublishInput = { accessToken: string; externalAccountId: string; payload: ContentPayload };

async function publishVia(platform: string, input: PublishInput) {
  switch (platform) {
    case "linkedin":
      return publishToLinkedIn({
        accessToken: input.accessToken,
        memberId: input.externalAccountId,
        payload: input.payload,
      });
    default:
      throw new ConnectorError("misconfigured", `There is no publish connector for ${platform} yet.`);
  }
}

/** FR-P-010a: failures the team must act on are never silent. Best-effort. */
async function notifyTeam(admin: Admin, workspaceId: string, subject: string, body: string) {
  if (!isEmailConfigured()) return;
  const { data: workspace } = await admin
    .from("workspaces")
    .select("name, notify_email")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!workspace?.notify_email) return;

  try {
    await notifyTeamMember({
      to: workspace.notify_email,
      subject: `[${workspace.name}] ${subject}`,
      body,
    });
  } catch (error) {
    // A notification failure must not change the job's recorded outcome.
    console.error(error);
  }
}

export async function executePublishJob(jobId: string): Promise<ExecuteOutcome> {
  const admin = createSupabaseAdminClient();

  const { data: claimData, error: claimError } = await admin.rpc("claim_publish_job", { p_job_id: jobId });
  if (claimError) throw claimError;

  const claim = claimData as {
    action: "publish" | "blocked" | "skip" | "reconciled";
    reason?: string;
    workspace_id?: string;
    account_id?: string;
    platform?: string;
  };

  if (claim.action === "skip") return { jobId, result: "skipped", message: claim.reason };
  if (claim.action === "reconciled") return { jobId, result: "reconciled" };
  if (claim.action === "blocked") {
    await notifyTeam(admin, claim.workspace_id!, "A post was blocked", `A publish job was blocked: ${claim.reason}.`);
    return { jobId, result: "blocked", message: claim.reason };
  }

  const [{ data: job }, { data: account }] = await Promise.all([
    admin.from("publish_jobs").select("id, workspace_id, platform, body_snapshot").eq("id", jobId).single(),
    admin
      .from("connected_accounts")
      .select("id, workspace_id, platform, external_account_id, display_name, access_token_encrypted, expires_at")
      .eq("id", claim.account_id!)
      .single(),
  ]);

  try {
    if (!job || !account) throw new ConnectorError("misconfigured", "The job or its account could not be loaded.");
    if (!account.access_token_encrypted) {
      throw new ConnectorError("token_revoked", "The account has no stored token. Reconnect it.");
    }
    if (account.expires_at && new Date(account.expires_at).getTime() <= Date.now()) {
      throw new ConnectorError("token_revoked", "The account's access token has expired. Reconnect it.");
    }

    const accessToken = decryptToken(
      account.access_token_encrypted,
      tokenContext(account.workspace_id, account.platform, account.external_account_id),
    );
    const payload = contentPayloadSchema.parse(job.body_snapshot);

    const receipt = await publishVia(account.platform, {
      accessToken,
      externalAccountId: account.external_account_id,
      payload,
    });

    const { error: finishError } = await admin.rpc("finish_publish_job", {
      p_job_id: jobId,
      p_published: true,
      p_external_id: receipt.externalId,
      p_permalink: receipt.permalink,
    });
    if (finishError) throw finishError;

    return { jobId, result: "published", permalink: receipt.permalink };
  } catch (error) {
    const message =
      error instanceof ConnectorError || error instanceof TokenDecryptError
        ? error.message
        : "Publishing failed unexpectedly. The error was logged.";
    if (!(error instanceof ConnectorError) && !(error instanceof TokenDecryptError)) console.error(error);

    const credentialProblem =
      error instanceof TokenDecryptError || (error instanceof ConnectorError && error.kind === "token_revoked");

    if (credentialProblem && account) {
      await admin.rpc("mark_account_expired", { p_account_id: account.id, p_reason: message });
    }

    const { error: finishError } = await admin.rpc("finish_publish_job", {
      p_job_id: jobId,
      p_published: false,
      p_error: message,
    });
    if (finishError) console.error(finishError);

    if (credentialProblem || (error instanceof ConnectorError && error.kind === "outcome_unknown")) {
      await notifyTeam(
        admin,
        job?.workspace_id ?? claim.workspace_id!,
        credentialProblem ? "Reconnect an account to keep publishing" : "Check whether a post went out",
        `A publish job to ${account?.display_name || claim.platform} failed: ${message}`,
      );
    }

    return { jobId, result: "failed", message };
  }
}

/** Runs due jobs one at a time. One job's failure never stops the rest. */
export async function runDuePublishJobs(
  options: { limit?: number; workspaceId?: string } = {},
): Promise<ExecuteOutcome[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("due_publish_jobs", {
    p_limit: options.limit ?? 20,
    p_workspace: options.workspaceId ?? null,
  });
  if (error) throw error;

  const outcomes: ExecuteOutcome[] = [];
  for (const jobId of (data ?? []) as string[]) {
    try {
      outcomes.push(await executePublishJob(jobId));
    } catch (runError) {
      console.error(runError);
      outcomes.push({ jobId, result: "failed", message: "The runner could not process this job." });
    }
  }
  return outcomes;
}
