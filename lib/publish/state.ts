/**
 * The publish job state machine (002 T2.6, FR-P-008), mirroring the transitions
 * the functions in supabase/migrations/0011_publish.sql perform. The database
 * is the enforcement; this is what the UI uses to decide which actions to show.
 */

export const PUBLISH_JOB_STATUSES = [
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

export const TRANSITIONS: Record<PublishJobStatus, readonly PublishJobStatus[]> = {
  // claim_publish_job: start, block, or reconcile a stored receipt; humans cancel.
  scheduled: ["publishing", "blocked", "published", "cancelled"],
  queued: ["publishing", "blocked", "published", "cancelled"],
  // finish_publish_job, or a stale attempt with an unknown outcome.
  publishing: ["published", "failed"],
  // request_publish_retry reuses the same job; cancel_publish_job gives up.
  failed: ["queued", "cancelled"],
  blocked: ["queued", "cancelled"],
  published: [],
  cancelled: [],
};

export function canTransition(from: PublishJobStatus, to: PublishJobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: PublishJobStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canRetry(status: PublishJobStatus): boolean {
  return canTransition(status, "queued");
}

export function canCancel(status: PublishJobStatus): boolean {
  return canTransition(status, "cancelled");
}
