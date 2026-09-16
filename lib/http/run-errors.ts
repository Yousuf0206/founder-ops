import "server-only";

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/knowledge/repo";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { ProviderError } from "@/lib/ai/provider";
import { UnparseableOutputError } from "@/lib/ai/research";
import { FetchFailedError, RobotsDisallowedError, UnsafeUrlError } from "@/lib/analyze/fetch";
import { NoEvidencedIdeasError } from "@/lib/strategy/run";
import { NoUsableHurdlesError, ThinPageError } from "@/lib/growth/analyze";

/**
 * 422 — the request was understood but refused on its content: an unsafe or
 * robots-disallowed URL, or research too thin to support any evidenced idea.
 */
function refusal(error: unknown): NextResponse | null {
  if (
    error instanceof UnsafeUrlError ||
    error instanceof RobotsDisallowedError ||
    error instanceof NoEvidencedIdeasError ||
    // Plan §7: a thin or JS-heavy page gets an honest "limited scan" message,
    // not a 500 the user can do nothing with.
    error instanceof ThinPageError ||
    // FR-GI-X-003: the whole hurdle list was dropped by the forbidden-pattern
    // floor. Nothing about the request was malformed, so this is a refusal.
    error instanceof NoUsableHurdlesError
  ) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof FetchFailedError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return null;
}

/**
 * Maps generation failures to HTTP responses.
 *
 * Each of these is a state the user can act on, so each gets its own status and
 * its own message rather than collapsing into a 500:
 *   401/403 — not signed in, or a viewer
 *   409     — nothing binds the prompt: no approved claims AND no extracted
 *             product facts. After v3.0.0 (T-A7) this no longer fires on a
 *             normal first run — extraction seeds the facts — so a 409 here now
 *             means extraction genuinely found nothing, or the workspace predates
 *             it. A 409 on the Growth Instant path is SC-02 regressing.
 *   429     — daily cap reached: wait, or raise the cap
 *   502     — provider failed
 *   503     — provider not configured on the server
 */
export function toRunResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const refused = refusal(error);
  if (refused) return refused;

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
