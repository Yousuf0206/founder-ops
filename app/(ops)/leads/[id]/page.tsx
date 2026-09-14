import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StageForm } from "./stage-form";
import { canWrite } from "@/lib/auth/session";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", session.activeWorkspace.workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/leads" className="text-sm text-muted">
        ← Leads
      </Link>

      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {lead.name || lead.email}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {lead.email} · via {lead.source} ·{" "}
        {new Date(lead.created_at).toLocaleString()}
        {lead.seen_count > 1 && ` · seen ${lead.seen_count} times`}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-line bg-surface p-4 text-sm">
        <Cell label="Segment" value={lead.segment} />
        <Cell label="Intent" value={lead.intent} />
        <Cell label="Score" value={`${lead.score} / 100`} />
      </dl>

      {lead.rationale && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-medium text-ink">Why: </span>
          {lead.rationale}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium">Message</h2>
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm">
          {lead.message || <span className="text-muted">(empty)</span>}
        </p>
      </section>

      <p className="mt-4 text-xs text-muted">
        {lead.notified_at
          ? `Owner notified ${new Date(lead.notified_at).toLocaleString()}. `
          : ""}
        No message has been sent to this person, and Founder Ops cannot send one.
      </p>

      {canWrite(session.activeWorkspace.role) && (
        <StageForm leadId={lead.id} stage={lead.stage} />
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
