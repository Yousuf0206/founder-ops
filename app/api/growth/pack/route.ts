import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { configuredModel } from "@/lib/ai/provider";
import { runGrowthPack } from "@/lib/growth/pack";
import { toRunResponse } from "@/lib/http/run-errors";
import { errorClass, errorKind, logEvent } from "@/lib/obs/log";
import { formatIssues } from "@/lib/validation/knowledge";

/**
 * POST /api/growth/pack (work order P2).
 *
 * The HTTP twin of the Hurdles "Generate pack" action, for the same reason
 * /api/growth/analyze exists beside the Start form: the pipeline is scriptable
 * and testable without driving a browser. Both go through `runGrowthPack`, so
 * the cap, the claim gate and the forbidden check cannot differ between them.
 *
 * An absent body means "the latest analysis", which is what the button does.
 */

const bodySchema = z.object({
  analyze_run_id: z.string().uuid("That is not a valid analysis id.").nullish(),
});

export async function POST(request: NextRequest) {
  // Same contract as the analyze route (T-5.1): one JSON line per attempt, no
  // prompt or post copy, error class and kind on failure.
  const startedAt = Date.now();
  let workspaceId: string | null = null;

  try {
    const session = await requireWriter();
    workspaceId = session.activeWorkspace.workspaceId;

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const { packId, draftIds } = await runGrowthPack(session, {
      analyzeRunId: parsed.data.analyze_run_id ?? undefined,
    });

    logEvent({
      event: "growth.pack",
      outcome: "ok",
      latencyMs: Date.now() - startedAt,
      runId: packId,
      workspaceId,
      model: configuredModel(),
      status: 201,
    });

    return NextResponse.json({ packId, draftIds }, { status: 201 });
  } catch (error) {
    const response = toRunResponse(error);
    logEvent({
      event: "growth.pack",
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
