import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireWriter } from "@/lib/knowledge/repo";
import { runStrategy } from "@/lib/strategy/run";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/** POST /api/ops/strategy/run (002 FR-S). Saves only ideas tied to verified evidence. */

const bodySchema = z
  .object({
    research_report_id: z.string().uuid().optional(),
    analyze_run_id: z.string().uuid().optional(),
  })
  .refine((body) => body.research_report_id || body.analyze_run_id, {
    message: "Provide research_report_id, analyze_run_id, or both.",
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

    const { ideaIds } = await runStrategy(session, parsed.data);
    return NextResponse.json({ ideaIds }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
