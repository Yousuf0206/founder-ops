import { NextResponse, type NextRequest } from "next/server";

import {
  getClaimSet,
  requireSession,
  requireWriter,
  upsertClaimSet,
} from "@/lib/knowledge/repo";
import { toResponse } from "@/lib/http/errors";
import { claimSetUpdateSchema, formatIssues } from "@/lib/validation/knowledge";

/**
 * /api/ops/knowledge/claims — the workspace's approved claims, forbidden
 * claims, and brand voice (FR-K-002).
 *
 * One claim set per workspace, so this is GET and PUT rather than a collection.
 * GET returns `claimSet: null` when none exists yet — the caller must be able to
 * tell "no claims defined" from "empty claims", because Phase 2 refuses to
 * generate in the first case (Constitution III).
 */

export async function GET() {
  try {
    const session = await requireSession();
    const claimSet = await getClaimSet(session.activeWorkspace.workspaceId);
    return NextResponse.json({ claimSet });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireWriter();

    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = claimSetUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const claimSet = await upsertClaimSet(session, parsed.data);
    return NextResponse.json({ claimSet });
  } catch (error) {
    return toResponse(error);
  }
}
