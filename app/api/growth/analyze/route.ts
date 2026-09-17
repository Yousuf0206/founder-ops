import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { runGrowthAnalysis, GROWTH_GOALS, MAX_GOAL_NOTE } from "@/lib/growth/analyze";
import { toRunResponse } from "@/lib/http/run-errors";
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
  try {
    const session = await requireWriter();

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

    return NextResponse.json({ analysisId, hurdles }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
