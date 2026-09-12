import { NextResponse, type NextRequest } from "next/server";

import { requireWriter } from "@/lib/knowledge/repo";
import { campaignRequestSchema, runCampaign } from "@/lib/ai/campaign";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/** POST /api/ops/campaigns/run (FR-M). Lands in the same approval queue. */

export async function POST(request: NextRequest) {
  try {
    const session = await requireWriter();

    const raw = await request.json().catch(() => null);
    if (raw === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = campaignRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const { campaignId } = await runCampaign(session, parsed.data);
    return NextResponse.json({ campaignId, status: "awaiting_approval" }, { status: 201 });
  } catch (error) {
    return toRunResponse(error);
  }
}
