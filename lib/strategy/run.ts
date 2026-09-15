import "server-only";

import type { OpsSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";
import { UnparseableOutputError } from "@/lib/ai/research";
import {
  flattenText,
  keepEvidenced,
  strategyOutputSchema,
  type EvidenceTexts,
  type Idea,
} from "@/lib/strategy/score";

/**
 * The strategy agent (002 US8, FR-S). Turns a saved research report and/or URL
 * analysis into campaign ideas scored 0–100 on impact, effort, and confidence.
 * Every saved idea carries evidence that was checked against its source.
 */

const STRATEGY_ROLE = `You are a growth strategist for an internal tool. Turn the evidence below into campaign ideas.

Score each idea from 0 to 100 on:
- impact: expected effect on the workspace's growth goals
- effort: work required to execute (100 = very hard)
- confidence: how strongly the supplied evidence supports the idea

Every idea MUST cite evidence. For each citation give the source ("research" or "analysis"), a short ref (the opportunity title or topic), and a quote copied EXACTLY from that source. An idea you cannot tie to supplied evidence must not be returned. Do not invent product facts; the approved claims above are the only product facts.

Return ONLY valid JSON:
{"ideas":[{"title":"...","angle":"...","impact":0,"effort":0,"confidence":0,"evidence":[{"source":"research|analysis","ref":"...","quote":"..."}]}]}`;

export class NoEvidencedIdeasError extends Error {
  constructor() {
    super(
      "No idea could be tied to the supplied evidence, so none were saved. Try a richer research report or analysis.",
    );
    this.name = "NoEvidencedIdeasError";
  }
}

export type StrategyInput = { research_report_id?: string; analyze_run_id?: string };

type Source = { id: string; title: string; text: string };

async function loadSource(
  table: "research_reports" | "analyze_runs",
  workspaceId: string,
  id: string | undefined,
): Promise<Source | null> {
  if (!id) return null;
  const supabase = await createSupabaseServerClient();

  const columns =
    table === "research_reports"
      ? "id, title, status, output_json"
      : "id, page_title, source_url, status, product_summary, themes, content_gaps, claim_risks, statements, unknowns";

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row || row.status !== "succeeded") {
    throw new AuthError("That source was not found in this workspace, or it did not succeed.", 404);
  }

  if (table === "research_reports") {
    return { id, title: String(row.title), text: flattenText(row.output_json) };
  }

  const { id: _id, status: _status, page_title, source_url, ...rest } = row;
  return { id, title: String(page_title || source_url), text: flattenText(rest) };
}

export async function runStrategy(
  session: OpsSession,
  input: StrategyInput,
): Promise<{ ideaIds: string[] }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [research, analysis] = await Promise.all([
    loadSource("research_reports", workspaceId, input.research_report_id),
    loadSource("analyze_runs", workspaceId, input.analyze_run_id),
  ]);

  if (!research && !analysis) {
    throw new AuthError("Choose a research report or an analysis to build ideas from.", 404);
  }

  const prompt: string[] = [];
  if (research) prompt.push(`<research title="${research.title}">`, research.text, "</research>");
  if (analysis) prompt.push(`<analysis title="${analysis.title}">`, analysis.text, "</analysis>");

  const { runId, result } = await runGeneration({
    session,
    action: "strategy.run",
    role: STRATEGY_ROLE,
    userPrompt: prompt.join("\n"),
    jsonMode: true,
  });

  let ideas: Idea[];
  try {
    const fenced = result.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    ideas = strategyOutputSchema.parse(JSON.parse((fenced?.[1] ?? result.text).trim())).ideas;
  } catch {
    throw new UnparseableOutputError(result.text);
  }

  const texts: EvidenceTexts = {};
  if (research) texts.research = research.text;
  if (analysis) texts.analysis = analysis.text;

  const evidenced = keepEvidenced(ideas, texts);
  const dropped = ideas.length - evidenced.length;

  if (evidenced.length === 0) {
    await writeAudit(workspaceId, "strategy.no_evidenced_ideas", "ai_run_log", runId, {
      proposed: ideas.length,
    });
    throw new NoEvidencedIdeasError();
  }

  const { data, error } = await supabase
    .from("strategy_ideas")
    .insert(
      evidenced.map((idea) => ({
        workspace_id: workspaceId,
        research_report_id: research?.id ?? null,
        analyze_run_id: analysis?.id ?? null,
        title: idea.title,
        angle: idea.angle,
        impact: idea.impact,
        effort: idea.effort,
        confidence: idea.confidence,
        evidence_refs: idea.evidence.map((evidence) => ({
          ...evidence,
          source_id: evidence.source === "research" ? research!.id : analysis!.id,
        })),
        run_id: runId,
        created_by: session.userId,
      })),
    )
    .select("id");

  if (error) throw error;

  await writeAudit(workspaceId, "strategy.completed", "ai_run_log", runId, {
    saved: evidenced.length,
    dropped_without_evidence: dropped,
  });

  return { ideaIds: (data ?? []).map((row) => row.id as string) };
}
