import "server-only";

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/knowledge/repo";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { ProviderError } from "@/lib/ai/provider";
import { UnparseableOutputError } from "@/lib/ai/research";

/**
 * Maps generation failures to HTTP responses.
 *
 * Each of these is a state the user can act on, so each gets its own status and
 * its own message rather than collapsing into a 500:
 *   401/403 — not signed in, or a viewer
 *   409     — no claim set: fix the knowledge base
 *   429     — daily cap reached: wait, or raise the cap
 *   502     — provider failed
 *   503     — provider not configured on the server
 */
export function toRunResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof MissingClaimSetError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof CapReachedError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }

  if (error instanceof ProviderNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof UnparseableOutputError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (error instanceof ProviderError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  console.error(error);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}
