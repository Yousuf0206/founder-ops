import { NextResponse, type NextRequest } from "next/server";

import { createDoc, listDocs, requireSession, requireWriter } from "@/lib/knowledge/repo";
import { toResponse } from "@/lib/http/errors";
import { formatIssues, knowledgeDocCreateSchema } from "@/lib/validation/knowledge";

/**
 * /api/ops/knowledge — list and create knowledge docs (FR-K-001).
 *
 * Every route requires a session and workspace membership (FR-S-004). The
 * workspace is taken from the session, never from the request body, so a
 * caller cannot name someone else's workspace.
 */

export async function GET() {
  try {
    const session = await requireSession();
    const docs = await listDocs(session.activeWorkspace.workspaceId);
    return NextResponse.json({ docs });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireWriter();

    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = knowledgeDocCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const doc = await createDoc(session, parsed.data);
    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

