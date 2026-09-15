import "server-only";

import { createSupabaseAdminClient } from "@/lib/db/server";

/**
 * Metrics for published posts (002 T4.3, FR-LRN-001, US6 AC1–AC2).
 *
 * FR-Q-105 (which metrics, what cadence) is open, so this runs on demand only
 * and records only what a connector can honestly supply. LinkedIn member-post
 * analytics need permissions this app does not request (it asks for
 * `w_member_social` only), so for LinkedIn the snapshot records the absence
 * plainly — SC-004 is met by the receipt plus a stated absence, never by an
 * estimate.
 */

const METRICS_UNAVAILABLE: Record<string, string> = {
  linkedin:
    "LinkedIn does not provide analytics for member posts with the permissions this app uses. The post receipt is shown instead.",
};

export function metricsAvailability(platform: string): { available: false; note: string } {
  return {
    available: false,
    note: METRICS_UNAVAILABLE[platform] ?? `No metrics connector exists for ${platform}.`,
  };
}

/**
 * Records a snapshot for each published job in the workspace that has none from
 * the last 24 hours. Caller must have resolved `workspaceId` from a session;
 * writes use the service role because members cannot write snapshots.
 */
export async function refreshMetricSnapshots(workspaceId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const [{ data: jobs, error: jobsError }, { data: recent, error: recentError }] = await Promise.all([
    admin
      .from("publish_jobs")
      .select("id, platform")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("performance_snapshots")
      .select("publish_job_id")
      .eq("workspace_id", workspaceId)
      .gte("fetched_at", since),
  ]);
  if (jobsError) throw jobsError;
  if (recentError) throw recentError;

  const fresh = new Set((recent ?? []).map((row) => row.publish_job_id as string));
  const due = (jobs ?? []).filter((job) => !fresh.has(job.id as string));
  if (due.length === 0) return 0;

  const { error } = await admin.from("performance_snapshots").insert(
    due.map((job) => ({
      workspace_id: workspaceId,
      publish_job_id: job.id,
      ...metricsAvailability(job.platform as string),
      metrics: {},
    })),
  );
  if (error) throw error;

  return due.length;
}
