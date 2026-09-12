import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { createSupabaseServerClient } from "@/lib/db/server";
import { ResearchForm } from "./research-form";

export default async function ResearchPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, { data: reports }] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    supabase
      .from("research_reports")
      .select("id, title, status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const writer = canWrite(session.activeWorkspace.role);

  // Each blocker is stated as the specific thing to fix, not a generic refusal.
  let disabled: string | undefined;
  if (!writer) disabled = "You have viewer access, so you cannot run research.";
  else if (!claimSet)
    disabled =
      "This workspace has no claim set. Generation is refused until approved and forbidden claims are defined under Knowledge.";
  else if (!isProviderConfigured())
    disabled =
      "No AI provider is configured on the server. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL.";
  else if (cap.used >= cap.cap)
    disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}). Runs resume at UTC midnight.`;

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Research</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            Turn raw notes into ranked opportunities. Internal only — reports are never sent
            anywhere.
          </p>
        </div>
        <p className="shrink-0 text-xs text-[--color-muted]">
          {cap.used} / {cap.cap} runs today
        </p>
      </div>

      <ResearchForm disabled={disabled} />

      <h2 className="mt-10 text-sm font-medium">Reports</h2>
      {(reports ?? []).length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[--color-line] p-6 text-sm text-[--color-muted]">
          No reports yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[--color-line] rounded-lg border border-[--color-line] bg-[--color-surface]">
          {(reports ?? []).map((report) => (
            <li key={report.id}>
              <Link
                href={`/research/${report.id}`}
                className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-[--color-ground]"
              >
                <span className="text-sm font-medium">{report.title}</span>
                <span className="shrink-0 text-xs text-[--color-muted]">
                  {report.status === "failed" && "failed · "}
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
