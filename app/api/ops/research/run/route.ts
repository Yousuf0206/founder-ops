import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { runResearch } from "@/lib/ai/research";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/** POST /api/ops/research/run (FR-R). Saves a report; sends nothing anywhere. */

const bodySchema = z.object({
  notes: z.string().min(1, "Paste some notes to analyse.").max(100_000),
  title: z.string().max(200).optional(),
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

    const { reportId } = await runResearch(session, parsed.data);
    return NextResponse.json({ reportId }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
