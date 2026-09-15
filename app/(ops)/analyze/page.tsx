import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { createSupabaseServerClient } from "@/lib/db/server";
import { AnalyzeForm } from "./analyze-form";

export default async function AnalyzePage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, { data: workspace }, { data: runs }] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    supabase.from("workspaces").select("primary_url").eq("id", workspaceId).maybeSingle(),
    supabase
      .from("analyze_runs")
      .select("id, source_url, page_title, status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  let disabled: string | undefined;
  if (!canWrite(session.activeWorkspace.role)) {
    disabled = "You have viewer access, so you cannot run an analysis.";
  } else if (!claimSet || !hasApprovedClaims(claimSet)) {
    disabled =
      "Analysis is refused until this workspace has at least one approved claim. Add claims under Knowledge.";
  } else if (!isProviderConfigured()) {
    disabled = "No AI provider is configured on the server. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL.";
  } else if (cap.used >= cap.cap) {
    disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}). Runs resume at UTC midnight.`;
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analyze</h1>
          <p className="mt-1 text-sm text-muted">
            Summarise a public product page: themes, content gaps, and risks against your claims.
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted">
          {cap.used} / {cap.cap} runs today
        </p>
      </div>

      <AnalyzeForm disabled={disabled} defaultUrl={workspace?.primary_url ?? undefined} />

      <h2 className="mt-10 text-sm font-medium">Analyses</h2>
      {(runs ?? []).length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          No analyses yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {(runs ?? []).map((run) => (
            <li key={run.id}>
              <Link
                href={`/analyze/${run.id}`}
                className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-ground"
              >
                <span className="truncate text-sm font-medium">{run.page_title || run.source_url}</span>
                <span className="shrink-0 text-xs text-muted">
                  {run.status === "failed" && "failed · "}
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
