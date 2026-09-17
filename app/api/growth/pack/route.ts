import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { runGrowthPack } from "@/lib/growth/pack";
import { toRunResponse } from "@/lib/http/run-errors";
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
  try {
    const session = await requireWriter();

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const { packId, draftIds } = await runGrowthPack(session, {
      analyzeRunId: parsed.data.analyze_run_id ?? undefined,
    });

    return NextResponse.json({ packId, draftIds }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
