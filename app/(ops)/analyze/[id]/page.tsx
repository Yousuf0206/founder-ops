import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { AnalysisOutput } from "@/lib/analyze/run";

const LABEL_STYLE: Record<string, string> = {
  Fact: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Inference: "bg-blue-50 text-blue-800 border-blue-200",
  Hypothesis: "bg-amber-50 text-amber-800 border-amber-200",
};

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: run } = await supabase
    .from("analyze_runs")
    .select("*")
    .eq("workspace_id", session.activeWorkspace.workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (!run) notFound();
  const output = run as AnalysisOutput & Record<string, string>;

  return (
    <div className="max-w-3xl">
      <Link href="/analyze" className="text-sm text-muted">
        ← Analyze
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{run.page_title || run.source_url}</h1>
      <p className="mt-1 break-all text-sm text-muted">
        {run.source_url} · {new Date(run.created_at).toLocaleString()}
      </p>

      {run.status === "failed" ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium">This analysis failed.</p>
          <p className="mt-1 text-muted">{run.error}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {output.product_summary && (
            <section>
              <h2 className="text-sm font-medium">Product summary</h2>
              <p className="mt-1 text-sm">{output.product_summary}</p>
            </section>
          )}
          <List title="Themes" items={output.themes} />
          <List title="Content gaps" items={output.content_gaps} />

          {output.claim_risks.length > 0 && (
            <section>
              <h2 className="text-sm font-medium">Risks against your claims</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {output.claim_risks.map((risk, index) => (
                  <li key={index} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                    <p className="font-medium">{risk.statement}</p>
                    {risk.risk && <p className="mt-1 text-muted">{risk.risk}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {output.statements.length > 0 && (
            <section>
              <h2 className="text-sm font-medium">Statements</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {output.statements.map((statement, index) => (
                  <li key={index} className="flex gap-2 text-sm">
                    <span
                      className={`h-fit shrink-0 rounded border px-1.5 py-0.5 text-xs ${
                        LABEL_STYLE[statement.label] ?? "border-line"
                      }`}
                    >
                      {statement.label}
                    </span>
                    <span>{statement.statement}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <List title="Unknowns" items={output.unknowns} />

          <Link
            href={`/strategy?analysis=${run.id}`}
            className="w-fit rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"
          >
            Build campaign ideas from this →
          </Link>
        </div>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-1 list-inside list-disc text-sm text-muted">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
