import { NextResponse, type NextRequest } from "next/server";

import {
  deleteDoc,
  getDoc,
  requireSession,
  requireWriter,
  updateDoc,
} from "@/lib/knowledge/repo";
import { toResponse } from "@/lib/http/errors";
import { formatIssues, knowledgeDocUpdateSchema } from "@/lib/validation/knowledge";

/** /api/ops/knowledge/:id — read, update, delete a single doc (FR-K-001). */

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const doc = await getDoc(session.activeWorkspace.workspaceId, id);

    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ doc });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const session = await requireWriter();

    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = knowledgeDocUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const doc = await updateDoc(session.activeWorkspace.workspaceId, id, parsed.data);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({ doc });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const session = await requireWriter();

    const deleted = await deleteDoc(session.activeWorkspace.workspaceId, id);
    if (!deleted) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toResponse(error);
  }
}
