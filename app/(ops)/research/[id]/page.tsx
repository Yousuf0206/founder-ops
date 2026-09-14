import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ResearchOutput } from "@/lib/ai/research";

const LABEL_STYLE: Record<string, string> = {
  Fact: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Inference: "bg-blue-50 text-blue-800 border-blue-200",
  Hypothesis: "bg-amber-50 text-amber-800 border-amber-200",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: report } = await supabase
    .from("research_reports")
    .select("*")
    .eq("workspace_id", session.activeWorkspace.workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (!report) notFound();

  const output = report.output_json as ResearchOutput | null;

  return (
    <div className="max-w-3xl">
      <Link href="/research" className="text-sm text-muted">
        ← Research
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{report.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {new Date(report.created_at).toLocaleString()}
      </p>

      {report.status === "failed" ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium">This run failed.</p>
          <p className="mt-1 text-muted">{report.error}</p>
        </div>
      ) : (
        output && <ReportBody output={output} />
      )}

      <details className="mt-10">
        <summary className="cursor-pointer text-sm text-muted">
          Source notes
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-xs">
          {report.input_blob}
        </pre>
      </details>
    </div>
  );
}

function ReportBody({ output }: { output: ResearchOutput }) {
  return (
    <div className="mt-6">
      {output.summary && <p className="text-sm">{output.summary}</p>}

      {output.opportunities.map((opportunity, index) => (
        <section
          key={`${opportunity.title}-${index}`}
          className="mt-6 rounded-lg border border-line bg-surface p-4"
        >
          <h2 className="text-sm font-semibold">
            {opportunity.rank ? `${opportunity.rank}. ` : ""}
            {opportunity.title}
          </h2>
          {opportunity.rationale && (
            <p className="mt-1 text-sm text-muted">{opportunity.rationale}</p>
          )}

          {opportunity.findings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {opportunity.findings.map((finding, findingIndex) => (
                <li key={findingIndex} className="flex gap-2 text-sm">
                  <span
                    className={`h-fit shrink-0 rounded border px-1.5 py-0.5 text-xs ${
                      LABEL_STYLE[finding.label] ?? "border-line"
                    }`}
                  >
                    {finding.label}
                  </span>
                  <span>{finding.statement}</span>
                </li>
              ))}
            </ul>
          )}

          {opportunity.suggested_next_step && (
            <p className="mt-3 text-sm">
              <span className="text-muted">Next step: </span>
              {opportunity.suggested_next_step}
            </p>
          )}
        </section>
      ))}

      {output.open_questions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Open questions</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            {output.open_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
