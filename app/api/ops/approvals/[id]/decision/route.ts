import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/knowledge/repo";
import { contentPayloadSchema } from "@/lib/ai/content";
import { decideOnDraft, markPublished } from "@/lib/approvals/repo";
import { toRunResponse } from "@/lib/http/run-errors";
import { formatIssues } from "@/lib/validation/knowledge";

/**
 * POST /api/ops/approvals/:id/decision (FR-A-002).
 *
 * `mark_published` is included here because it is the same kind of act — a
 * human recording a decision. It changes a status and writes an audit row; it
 * publishes nothing (FR-A-003).
 */

const bodySchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approved"),
    notes: z.string().max(2_000).optional(),
  }),
  z.object({
    decision: z.literal("rejected"),
    notes: z.string().max(2_000).optional(),
  }),
  z.object({
    decision: z.literal("edited_and_approved"),
    payload: contentPayloadSchema,
    notes: z.string().max(2_000).optional(),
  }),
  z.object({ decision: z.literal("mark_published") }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSession();

    const raw = await request.json().catch(() => null);
    if (raw === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    // Authority is checked in the database, inside decide_on_draft() and
    // mark_draft_published(), so it holds for every caller of either.
    if (parsed.data.decision === "mark_published") {
      await markPublished(id);
      return NextResponse.json({ status: "published" });
    }

    await decideOnDraft({
      draftId: id,
      decision: parsed.data.decision,
      editedPayload:
        parsed.data.decision === "edited_and_approved" ? parsed.data.payload : undefined,
      notes: parsed.data.notes,
    });

    return NextResponse.json({
      status: parsed.data.decision === "rejected" ? "rejected" : "approved",
    });
  } catch (error) {
    return toRunResponse(error);
  }
}
