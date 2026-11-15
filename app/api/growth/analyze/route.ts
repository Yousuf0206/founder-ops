import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { configuredModel } from "@/lib/ai/provider";
import { runGrowthAnalysis, GROWTH_GOALS, MAX_GOAL_NOTE } from "@/lib/growth/analyze";
import { toRunResponse } from "@/lib/http/run-errors";
import { errorClass, errorKind, logEvent } from "@/lib/obs/log";
import { formatIssues } from "@/lib/validation/knowledge";

/**
 * POST /api/growth/analyze (T-A2; FR-GI-S-002/004).
 *
 * The Start screen's only endpoint. Takes a URL and an optional goal, and
 * returns the hurdle list. No claim set is required to reach it — that is the
 * whole point of v3.0.0 (FR-GI-X-004, SC-02).
 */

const bodySchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter your product's URL to get started.")
    .max(2000, "That URL is too long."),
  // FR-GI-S-002: optional. An absent goal must never block the run.
  goal: z.enum(GROWTH_GOALS).nullish(),
  // Free text behind goal "other". Bounded here and again in the column.
  goal_note: z.string().trim().max(MAX_GOAL_NOTE, "That is too long — keep it to a phrase.").nullish(),
});

export async function POST(request: NextRequest) {
  /*
   * T-5.1 / NFR-03. This endpoint is the one the recovery milestone needs to be
   * diagnosable from logs alone: when a founder says "it didn't work", the line
   * written below says whether we could not read their page, could not reach a
   * provider, or were never configured — without anyone reproducing the run.
   * No URL, page text or hurdle copy is logged; the run id joins to the row.
   */
  const startedAt = Date.now();
  let workspaceId: string | null = null;

  try {
    const session = await requireWriter();
    workspaceId = session.activeWorkspace.workspaceId;

    const raw = await request.json().catch(() => null);
    if (raw === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const { analysisId, hurdles } = await runGrowthAnalysis(session, {
      url: parsed.data.url,
      goal: parsed.data.goal ?? null,
      goalNote: parsed.data.goal === "other" ? (parsed.data.goal_note ?? null) : null,
    });

    logEvent({
      event: "growth.analyze",
      outcome: "ok",
      latencyMs: Date.now() - startedAt,
      runId: analysisId,
      workspaceId,
      model: configuredModel(),
      status: 201,
    });

    return NextResponse.json({ analysisId, hurdles }, { status: 201 });
  } catch (error) {
    const response = toRunResponse(error);
    logEvent({
      event: "growth.analyze",
      outcome: "error",
      latencyMs: Date.now() - startedAt,
      workspaceId,
      model: configuredModel(),
      status: response.status,
      errorClass: errorClass(error),
      errorKind: errorKind(error),
    });
    return response;
  }
}
