import "server-only";

/**
 * Structured server logs (004 T-5.1, NFR-03).
 *
 * Vercel captures stdout per invocation, so one JSON line per event is enough
 * to answer the question this milestone kept failing to answer: *why* did an
 * analyze run fail on production — a page we could not read, a missing key, a
 * provider outage, or an unauthenticated caller?
 *
 * Rules, in order of importance:
 *
 *   1. Never log a secret. The fields are named here, individually, and the
 *      caller passes scalars. There is no "log the whole object" path, because
 *      the objects on this code path hold tokens and page text.
 *   2. Never log page text or generated copy. The run id is the join key; the
 *      row in the database holds the content.
 *   3. Error *class*, not error message. Messages are user-facing prose and
 *      change with copy edits; `ThinPageError` is a stable thing to alert on.
 *   4. Logging must never break a request. Everything here is wrapped.
 */

type Scalar = string | number | boolean | null;

export type LogEvent = {
  /** Dot-separated, stable: `growth.analyze`, `growth.pack`. */
  event: string;
  outcome: "ok" | "error";
  /** Wall-clock duration of the operation, milliseconds. */
  latencyMs: number;
  /** The `analyze_runs` / `growth_packs` row, when one was created. */
  runId?: string | null;
  /** Error constructor name — `ThinPageError`, `ProviderNotConfiguredError`. */
  errorClass?: string | null;
  /** Coarse bucket for alerting: see `errorKind()`. */
  errorKind?: ErrorKind | null;
  /** Model identifier, e.g. a model slug. Never the key. */
  model?: string | null;
  /** HTTP status the caller returned. */
  status?: number | null;
  workspaceId?: string | null;
};

/**
 * The error taxonomy of SC-08, as a log field.
 *
 * `extract` is the only one the user may be told "we could not read your page"
 * about (constitution R5). The other three are our fault or our configuration,
 * and the production triage order is: `ai_config` first (we broke the deploy),
 * then `ai_provider` (someone else broke, or the key is dead), then the rest.
 */
export type ErrorKind =
  | "extract"
  | "ai_config"
  | "ai_provider"
  | "auth"
  | "cap"
  | "refusal"
  | "unknown";

const KIND_BY_CLASS: Record<string, ErrorKind> = {
  // Reading the page
  FetchFailedError: "extract",
  RobotsDisallowedError: "extract",
  UnsafeUrlError: "extract",
  ThinPageError: "extract",
  // Our configuration
  ProviderNotConfiguredError: "ai_config",
  // The provider itself, or a key it rejected
  ProviderError: "ai_provider",
  UnparseableOutputError: "ai_provider",
  UnparseablePackError: "ai_provider",
  // The caller
  AuthError: "auth",
  CapReachedError: "cap",
  // Content refusals: the request was fine, the output was not usable
  NoUsableHurdlesError: "refusal",
  PackForbiddenContentError: "refusal",
  NoEvidencedIdeasError: "refusal",
  MissingClaimSetError: "refusal",
  NoAnalysisError: "refusal",
};

/** Maps a thrown value to its alerting bucket. Unknown classes stay `unknown`. */
export function errorKind(error: unknown): ErrorKind {
  const name = error instanceof Error ? error.name : "";
  return KIND_BY_CLASS[name] ?? "unknown";
}

export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Writes one JSON line. Swallows its own failures by design (rule 4). */
export function logEvent(event: LogEvent): void {
  try {
    const line: Record<string, Scalar> = {
      ts: new Date().toISOString(),
      event: event.event,
      outcome: event.outcome,
      latency_ms: Math.round(event.latencyMs),
    };
    if (event.runId) line.run_id = event.runId;
    if (event.workspaceId) line.workspace_id = event.workspaceId;
    if (event.model) line.model = event.model;
    if (typeof event.status === "number") line.status = event.status;
    if (event.errorClass) line.error_class = event.errorClass;
    if (event.errorKind) line.error_kind = event.errorKind;

    // One line, not console.error, so a failed run does not also page anyone
    // through Vercel's error-level alerting: `outcome` is the signal.
    console.log(JSON.stringify(line));
  } catch {
    // Observability must never be the reason a request fails.
  }
}
