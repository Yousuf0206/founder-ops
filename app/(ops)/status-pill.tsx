const STYLES: Record<string, string> = {
  draft: "border-[--color-line] text-[--color-muted]",
  awaiting_approval: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  published: "border-blue-200 bg-blue-50 text-blue-800",
};

const LABELS: Record<string, string> = {
  draft: "draft",
  awaiting_approval: "awaiting approval",
  approved: "approved",
  rejected: "rejected",
  published: "published manually",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        STYLES[status] ?? "border-[--color-line]"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
