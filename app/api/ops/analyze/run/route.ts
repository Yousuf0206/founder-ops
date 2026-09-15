import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { runAnalyze } from "@/lib/analyze/run";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/** POST /api/ops/analyze/run (002 FR-O). Fetches one public page, honouring robots.txt. */

const bodySchema = z.object({
  url: z.string().trim().min(1, "Enter a URL to analyse.").max(2000),
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

    const { analysisId } = await runAnalyze(session, parsed.data);
    return NextResponse.json({ analysisId }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
