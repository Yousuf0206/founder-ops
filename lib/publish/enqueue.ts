import "server-only";

import type { OpsSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * The human side of the publish path (002 T2.7, T2.9, T2.11).
 *
 * Runs as the signed-in reviewer, so approval rights are the database's check.
 * enqueue_publish_job() performs the claim check on the draft's FINAL body —
 * after any reviewer edit — together with the account, platform, and mode
 * checks, and audits a refusal. Nothing here trusts a body or a target from the
 * request: the draft id and account id are looked up, never taken as content.
 */

export class PublishRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishRefusedError";
  }
}

type DbError = { code?: string; message: string };

function toRefusal(error: DbError): Error {
  if (error.code === "23505") {
    return new PublishRefusedError("This draft is already queued, blocked, or published to that account.");
  }
  if (error.code === "42501" || /approval rights|only an owner/i.test(error.message)) {
    return new AuthError(error.message, 403);
  }
  if (/not found|can no longer be cancelled|only a failed or blocked/i.test(error.message)) {
    return new PublishRefusedError(error.message);
  }
  return new Error(error.message);
}

export async function enqueuePublish(
  session: OpsSession,
  input: { draftId: string; accountId: string; scheduledFor?: Date },
): Promise<{ jobId: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("enqueue_publish_job", {
    p_draft_id: input.draftId,
    p_account_id: input.accountId,
    p_scheduled_for: input.scheduledFor?.toISOString() ?? null,
  });

  if (error) throw toRefusal(error);

  const result = data as { job_id: string | null; refused: string | null };
  if (!result.job_id) {
    throw new PublishRefusedError(
      `Publishing was refused: ${result.refused ?? "unknown reason"}. The refusal was recorded in the audit log.`,
    );
  }

  void session; // identity travels in the session cookie; kept for call-site symmetry
  return { jobId: result.job_id };
}

export async function retryPublish(jobId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_publish_retry", { p_job_id: jobId });
  if (error) throw toRefusal(error);
}

export async function cancelPublish(jobId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_publish_job", { p_job_id: jobId });
  if (error) throw toRefusal(error);
}

export async function disconnectAccount(accountId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("revoke_connected_account", { p_account_id: accountId });
  if (error) throw toRefusal(error);
  return (data as number | null) ?? 0;
}
