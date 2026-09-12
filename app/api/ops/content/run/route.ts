import { NextResponse, type NextRequest } from "next/server";

import { requireWriter } from "@/lib/knowledge/repo";
import { contentRequestSchema, runContent } from "@/lib/ai/content";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/** POST /api/ops/content/run (FR-C). Always lands in awaiting_approval. */

export async function POST(request: NextRequest) {
  try {
    const session = await requireWriter();

    const raw = await request.json().catch(() => null);
    if (raw === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = contentRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const { draftId } = await runContent(session, parsed.data);
    return NextResponse.json({ draftId, status: "awaiting_approval" }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
