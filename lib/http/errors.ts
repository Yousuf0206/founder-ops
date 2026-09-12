import "server-only";

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/knowledge/repo";

/**
 * Maps a thrown error to an HTTP response.
 *
 * Lives here rather than in a route file because Next.js only permits HTTP
 * method exports from a route module — anything else fails the type check.
 *
 * Unexpected errors are logged server-side and returned as a bare 500: the
 * client is never told what broke, since the message could carry row contents
 * from another workspace.
 */
export function toResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}
