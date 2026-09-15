/** Status labels for drafts and publish jobs (002 FR-P-008: per-platform status). */

const STYLES: Record<string, string> = {
  draft: "border-line text-muted",
  awaiting_approval: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  published: "border-blue-200 bg-blue-50 text-blue-800",
  scheduled: "border-violet-200 bg-violet-50 text-violet-800",
  queued: "border-violet-200 bg-violet-50 text-violet-800",
  publishing: "border-blue-200 bg-blue-50 text-blue-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  blocked: "border-amber-300 bg-amber-50 text-amber-900",
  cancelled: "border-line text-muted",
};

const LABELS: Record<string, string> = {
  draft: "draft",
  awaiting_approval: "awaiting approval",
  approved: "approved",
  rejected: "rejected",
  published: "published",
  scheduled: "scheduled",
  queued: "queued",
  publishing: "publishing",
  failed: "failed",
  blocked: "blocked",
  cancelled: "cancelled",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        STYLES[status] ?? "border-line"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
