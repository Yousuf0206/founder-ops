import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { createSupabaseServerClient } from "@/lib/db/server";
import { priorityScore, rankIdeas, type Evidence } from "@/lib/strategy/score";
import { discardIdeaAction } from "./actions";
import { StrategyForm } from "./strategy-form";

type IdeaRow = {
  id: string;
  title: string;
  angle: string;
  impact: number;
  effort: number;
  confidence: number;
  evidence_refs: Evidence[];
  status: string;
  created_at: string;
};

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ analysis?: string }>;
}) {
  const { analysis } = await searchParams;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, { data: reports }, { data: analyses }, { data: ideas }] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    supabase
      .from("research_reports")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("analyze_runs")
      .select("id, page_title, source_url")
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("strategy_ideas")
      .select("id, title, angle, impact, effort, confidence, evidence_refs, status, created_at")
      .eq("workspace_id", workspaceId)
      .neq("status", "discarded")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const writer = canWrite(session.activeWorkspace.role);

  let disabled: string | undefined;
  if (!writer) disabled = "You have viewer access, so you cannot generate ideas.";
  else if (!claimSet || !hasApprovedClaims(claimSet))
    disabled = "Idea generation is refused until this workspace has at least one approved claim.";
  else if (!isProviderConfigured())
    disabled = "No AI provider is configured on the server. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL.";
  else if (cap.used >= cap.cap)
    disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}). Runs resume at UTC midnight.`;
  else if ((reports ?? []).length === 0 && (analyses ?? []).length === 0)
    disabled = "Run research or analyse a URL first — ideas are built only from saved evidence.";

  const ranked = rankIdeas((ideas ?? []) as IdeaRow[]);

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Strategy</h1>
          <p className="mt-1 text-sm text-muted">
            Scored campaign ideas, each tied to the research or analysis behind it.
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted">
          {cap.used} / {cap.cap} runs today
        </p>
      </div>

      <StrategyForm
        disabled={disabled}
        reports={(reports ?? []).map((r) => ({ id: r.id, label: r.title }))}
        analyses={(analyses ?? []).map((a) => ({ id: a.id, label: a.page_title || a.source_url }))}
        defaultAnalysis={analysis}
      />

      <h2 className="mt-10 text-sm font-medium">Ideas, highest priority first</h2>
      {ranked.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          No ideas yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {ranked.map((idea) => (
            <li key={idea.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">{idea.title}</h3>
                  {idea.angle && <p className="mt-1 text-sm text-muted">{idea.angle}</p>}
                </div>
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs">
                  priority {priorityScore(idea)}
                </span>
              </div>

              <p className="mt-2 text-xs text-muted">
                impact {idea.impact} · effort {idea.effort} · confidence {idea.confidence}
                {idea.status === "selected" && " · drafted"}
              </p>

              <ul className="mt-3 flex flex-col gap-1">
                {idea.evidence_refs.map((evidence, index) => (
                  <li key={index} className="text-xs text-muted">
                    <span className="font-medium text-ink">{evidence.source}</span> · {evidence.ref}:
                    &ldquo;{evidence.quote}&rdquo;
                  </li>
                ))}
              </ul>

              {writer && (
                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href={`/content?idea=${idea.id}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Draft assets
                  </Link>
                  <form action={discardIdeaAction}>
                    <input type="hidden" name="idea_id" value={idea.id} />
                    <button type="submit" className="text-xs text-muted underline">
                      Discard
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
