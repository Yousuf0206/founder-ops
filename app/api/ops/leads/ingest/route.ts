import { NextResponse, type NextRequest } from "next/server";

import {
  ingestLead,
  InvalidIngestSecretError,
  leadPayloadSchema,
  workspaceForSecret,
} from "@/lib/leads/ingest";
import { formatIssues } from "@/lib/validation/knowledge";

/**
 * POST /api/ops/leads/ingest (FR-L-001).
 *
 * The only route in the product without a user session. It authenticates with
 * a per-workspace shared secret:
 *
 *   POST /api/ops/leads/ingest
 *   x-founder-ops-workspace: lumo
 *   x-founder-ops-secret:    <the workspace's ingest secret>
 *   { "email": "...", "name": "...", "message": "...", "source": "site-form" }
 *
 * The workspace comes from the verified secret, never from the body — so a
 * caller holding one workspace's key cannot write into another's.
 *
 * Nothing is ever sent to the lead (Constitution IV).
 */

export async function POST(request: NextRequest) {
  const slug = request.headers.get("x-founder-ops-workspace");
  const secret = request.headers.get("x-founder-ops-secret");

  if (!slug || !secret) {
    return NextResponse.json(
      { error: "Missing ingest credentials." },
      { status: 401 },
    );
  }

  try {
    const workspace = await workspaceForSecret(slug, secret);

    const raw = await request.json().catch(() => null);
    if (raw === null) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }

    const parsed = leadPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
    }

    const result = await ingestLead(workspace, parsed.data);

    return NextResponse.json(
      { leadId: result.leadId, duplicate: result.duplicate, notified: result.notified },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof InvalidIngestSecretError) {
      // Same response for a bad slug and a bad secret, so the endpoint does not
      // confirm which workspaces exist.
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
