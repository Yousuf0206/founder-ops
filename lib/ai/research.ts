import "server-only";

import { z } from "zod";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";

/**
 * The research bot (FR-R). Reads pasted notes, returns ranked opportunities in
 * which every claim-bearing statement carries a Fact / Inference / Hypothesis
 * label, and saves the report. It sends nothing anywhere (FR-R-003).
 */

const RESEARCH_ROLE = `You are a research analyst for an internal operations tool.
You read raw customer feedback and competitor notes and return ranked opportunities.

Every claim-bearing statement you make MUST be labelled with exactly one of:
- "Fact" — stated explicitly in the supplied notes or in the knowledge base above.
- "Inference" — a reasonable deduction from those, with the reasoning stated.
- "Hypothesis" — a guess worth testing, clearly not established.

Never label something Fact unless you can point to where it came from.
Rank opportunities by expected impact and state why.

Return ONLY valid JSON matching this shape:
{
  "summary": "one paragraph",
  "opportunities": [
    {
      "title": "short title",
      "rank": 1,
      "rationale": "why this matters",
      "findings": [ { "label": "Fact|Inference|Hypothesis", "statement": "..." } ],
      "suggested_next_step": "one concrete action"
    }
  ],
  "open_questions": ["..."]
}`;

const findingSchema = z.object({
  label: z.enum(["Fact", "Inference", "Hypothesis"]),
  statement: z.string().min(1),
});

const researchOutputSchema = z.object({
  summary: z.string().default(""),
  opportunities: z
    .array(
      z.object({
        title: z.string().min(1),
        rank: z.number().int().optional(),
        rationale: z.string().default(""),
        findings: z.array(findingSchema).default([]),
        suggested_next_step: z.string().default(""),
      }),
    )
    .default([]),
  open_questions: z.array(z.string()).default([]),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export class UnparseableOutputError extends Error {
  constructor(readonly raw: string) {
    super("The model returned output that could not be parsed as a research report.");
    this.name = "UnparseableOutputError";
  }
}

/** Strips ```json fences some models add despite JSON mode. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export async function runResearch(
  session: OpsSession,
  input: { notes: string; title?: string },
): Promise<{ reportId: string }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const { runId, result } = await runGeneration({
    session,
    action: "research.run",
    role: RESEARCH_ROLE,
    userPrompt: `Notes to analyse:\n\n${input.notes}`,
    jsonMode: true,
  });

  let parsed: ResearchOutput;
  try {
    parsed = researchOutputSchema.parse(JSON.parse(extractJson(result.text)));
  } catch {
    // T2.11: a failed parse saves a failed report, never a half-good one.
    await supabase.from("research_reports").insert({
      workspace_id: workspaceId,
      title: input.title?.trim() || "Research report",
      input_blob: input.notes,
      status: "failed",
      error: "Model output could not be parsed as JSON in the expected shape.",
      run_id: runId,
      created_by: session.userId,
    });
    throw new UnparseableOutputError(result.text);
  }

  const { data: report, error } = await supabase
    .from("research_reports")
    .insert({
      workspace_id: workspaceId,
      title: input.title?.trim() || parsed.opportunities[0]?.title || "Research report",
      input_blob: input.notes,
      output_json: parsed,
      output_markdown: toMarkdown(parsed),
      status: "succeeded",
      run_id: runId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  await writeAudit(workspaceId, "research.completed", "research_report", report.id, {
    opportunities: parsed.opportunities.length,
  });

  return { reportId: report.id };
}

export function toMarkdown(output: ResearchOutput): string {
  const lines: string[] = [];

  if (output.summary) lines.push(output.summary, "");

  for (const opportunity of output.opportunities) {
    lines.push(`## ${opportunity.rank ? `${opportunity.rank}. ` : ""}${opportunity.title}`);
    if (opportunity.rationale) lines.push("", opportunity.rationale);

    if (opportunity.findings.length > 0) {
      lines.push("");
      for (const finding of opportunity.findings) {
        lines.push(`- **${finding.label}** — ${finding.statement}`);
      }
    }

    if (opportunity.suggested_next_step) {
      lines.push("", `_Next step:_ ${opportunity.suggested_next_step}`);
    }
    lines.push("");
  }

  if (output.open_questions.length > 0) {
    lines.push("## Open questions", "");
    for (const question of output.open_questions) lines.push(`- ${question}`);
  }

  return lines.join("\n").trim();
}
