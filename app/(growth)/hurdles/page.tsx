import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { hurdleSchema, type Hurdle } from "@/lib/growth/analyze";
import { GeneratePack } from "../pack/generate-pack";

/**
 * Hurdles — destination 2 of 5 (T-A6; FR-GI-H-001..004).
 *
 * Shows the most recent analysis for the active workspace. "Generate pack" is
 * an ACTION on this screen, not a destination of its own (nav contract).
 */

export const metadata = {
  title: "Hurdles — Lumo Grow",
};

type AnalyzeRunRow = {
  id: string;
  source_url: string;
  status: "running" | "succeeded" | "failed";
  hurdles: unknown;
  error: string | null;
  created_at: string;
};

/** Model output is stored as jsonb; re-validate on read rather than trusting the column. */
function parseHurdles(raw: unknown): Hurdle[] {
  if (!Array.isArray(raw)) return [];
  const parsed: Hurdle[] = [];
  for (const item of raw) {
    const result = hurdleSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

export default async function HurdlesPage() {
  const session = await getOpsSession();

  // No workspace yet means no analysis has ever run: send them to Start rather
  // than showing an empty screen with nothing to do.
  if (!session) redirect("/start");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("analyze_runs")
    .select("id, source_url, status, hurdles, error, created_at")
    .eq("workspace_id", session.activeWorkspace.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const run = data as AnalyzeRunRow | null;
  if (!run) redirect("/start");

  const hurdles = parseHurdles(run.hurdles);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your growth hurdles</h1>
        <p className="text-sm text-muted break-all">{run.source_url}</p>
      </div>

      {/* FR-GI-H-004: running / ready / failed, each with what to do next. */}
      {run.status === "running" && (
        <StatusCard tone="info">
          <p className="font-medium">Still reading your site.</p>
          <p className="mt-1">
            This usually takes under two minutes. Refresh to check.
          </p>
        </StatusCard>
      )}

      {run.status === "failed" && (
        <StatusCard tone="warn">
          <p className="font-medium">That analysis didn&rsquo;t finish.</p>
          <p className="mt-1">{run.error ?? "The run failed before it produced hurdles."}</p>
          <Link
            href="/start"
            className="mt-3 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
          >
            Try again
          </Link>
        </StatusCard>
      )}

      {run.status === "succeeded" && hurdles.length === 0 && (
        <StatusCard tone="warn">
          <p className="font-medium">We couldn&rsquo;t read enough from that page.</p>
          <p className="mt-1">
            Try your home page or a product page rather than a login screen.
          </p>
          <Link
            href="/start"
            className="mt-3 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
          >
            Try another URL
          </Link>
        </StatusCard>
      )}

      {hurdles.length > 0 && (
        <>
          <ol className="mt-6 flex flex-col gap-4">
            {hurdles.map((hurdle, index) => (
              <li
                key={`${index}-${hurdle.title}`}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-muted">{index + 1}</span>
                  <h2 className="text-base font-semibold">{hurdle.title}</h2>
                </div>

                {hurdle.explanation && (
                  <p className="mt-2 text-sm">{hurdle.explanation}</p>
                )}

                {hurdle.why_it_hurts && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Why it hurts: </span>
                    {hurdle.why_it_hurts}
                  </p>
                )}

                {hurdle.suggested_fix && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Suggested fix: </span>
                    {hurdle.suggested_fix}
                  </p>
                )}

                {hurdle.content_actions.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {hurdle.content_actions.map((action) => (
                      <li
                        key={action}
                        className="rounded-full border border-line px-3 py-1 text-xs text-muted"
                      >
                        {action}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          {/* FR-GI-H-003: ONE primary CTA, and it really is an action — it runs
              the generation here and then shows the result on /pack. A link to
              /pack would have made Pack a place you go to start work rather than
              a place the work lands. */}
          <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-start">
            <GeneratePack />
            <Link href="/start" className="text-sm text-muted hover:text-fg sm:pt-2.5">
              Analyse a different URL
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function StatusCard({
  tone,
  children,
}: {
  tone: "info" | "warn";
  children: React.ReactNode;
}) {
  const palette =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-line bg-surface";

  return <div className={`mt-6 rounded-lg border p-4 text-sm ${palette}`}>{children}</div>;
}
