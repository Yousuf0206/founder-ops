import Link from "next/link";

import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";

const INTENT_STYLE: Record<string, string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-line text-muted",
  unknown: "border-line text-muted",
};

export default async function LeadsPage() {
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", session.activeWorkspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-1 text-sm text-muted">
        Inbound only. Founder Ops never contacts a lead — high-intent arrivals notify the
        workspace owner instead.
      </p>

      {(leads ?? []).length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          No leads yet. Point a form at{" "}
          <code className="text-xs">POST /api/ops/leads/ingest</code> with this workspace&rsquo;s
          ingest secret.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {(leads ?? []).map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-ground"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {lead.name || lead.email}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {lead.segment} · {lead.source} · {lead.stage}
                    {lead.seen_count > 1 && ` · seen ${lead.seen_count}×`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{lead.score}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      INTENT_STYLE[lead.intent] ?? ""
                    }`}
                  >
                    {lead.intent}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
