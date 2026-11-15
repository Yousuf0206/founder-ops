import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { platformLabel } from "@/lib/content/platforms";
import type { PublishJobStatus } from "@/lib/publish/state";

/**
 * Next — destination 5 of 5 (004 T-2.2; spec 003 T-D1).
 *
 * The nav has pointed here since the Instant shell was written, but the route
 * did not exist: the fifth primary destination returned a 404 in production.
 * That is a constitution R2 violation, not a missing nice-to-have, which is why
 * this screen exists before the Phase 4 publish work is finished.
 *
 * Its job is narrow and it must stay narrow: what came of the loop (receipts),
 * and the three things worth doing next. No charts, no ops widgets. Anything
 * richer belongs in Advanced → Insights.
 *
 * Deliberately read-only. Every action is a link to the screen that owns it, so
 * there is one implementation of publishing, approving and analysing rather than
 * a second set of buttons to keep in step.
 */

export const metadata = {
  title: "Next — Lumo Grow",
};

type JobRow = {
  id: string;
  status: PublishJobStatus;
  platform: string;
  permalink: string | null;
  platform_error: string | null;
  created_at: string;
  content_drafts: { topic: string } | null;
};

/** Plain-language status, since this screen is read by founders, not operators. */
function statusLine(job: JobRow): string {
  switch (job.status) {
    case "published":
      return "Published";
    case "failed":
      return job.platform_error ? `Failed — ${job.platform_error}` : "Failed";
    case "blocked":
      return "Held back by a safety check";
    case "cancelled":
      return "Cancelled";
    case "publishing":
      return "Sending now";
    default:
      return "Waiting to send";
  }
}

export default async function NextPage() {
  const session = await getOpsSession();

  // No workspace means the loop has not started once. Start owns that case.
  if (!session) redirect("/start");

  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [{ data: jobData }, { data: accounts }, { data: drafts }, { data: run }] =
    await Promise.all([
      supabase
        .from("publish_jobs")
        .select(
          "id, status, platform, permalink, platform_error, created_at, content_drafts (topic)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("connected_accounts")
        .select("id, platform, display_name")
        .eq("workspace_id", workspaceId)
        .is("revoked_at", null)
        .eq("status", "active"),
      supabase
        .from("content_drafts")
        .select("id, status")
        .eq("workspace_id", workspaceId)
        // Pack writes drafts at the column default, `awaiting_approval`
        // (lib/growth/pack.ts), so that — not 'draft' — is the waiting state.
        .in("status", ["awaiting_approval", "approved"])
        .limit(100),
      supabase
        .from("analyze_runs")
        .select("source_url, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const jobs = (jobData ?? []) as unknown as JobRow[];
  const published = jobs.filter((job) => job.status === "published");
  const connected = accounts ?? [];
  const awaitingApproval = (drafts ?? []).filter((d) => d.status === "awaiting_approval").length;
  const approved = (drafts ?? []).filter((d) => d.status === "approved").length;
  const lastUrl = (run as { source_url?: string } | null)?.source_url ?? null;

  /*
   * The three next actions, in the order the loop actually blocks:
   * no channel → nothing can ship; posts waiting → words need a human; then
   * the loop repeats on a new URL. Exactly three, so this never becomes a
   * dashboard of suggestions.
   */
  const actions: { href: string; label: string; detail: string }[] = [];

  if (connected.length === 0) {
    actions.push({
      href: "/publish",
      label: "Connect a channel",
      detail: "Nothing can ship until one account is connected. LinkedIn takes a minute.",
    });
  } else if (awaitingApproval > 0) {
    actions.push({
      href: "/publish",
      label: `Approve ${awaitingApproval} post${awaitingApproval === 1 ? "" : "s"}`,
      detail: "Read the words, then approve. Approval is yours, never the model's.",
    });
  } else if (approved > 0) {
    actions.push({
      href: "/publish",
      label: `Publish ${approved} approved post${approved === 1 ? "" : "s"}`,
      detail: "Approved and waiting. Send one and you have a receipt.",
    });
  } else {
    actions.push({
      href: "/results",
      label: "Write more posts",
      detail: "Your posts are spent. Write a fresh set from the problems we found.",
    });
  }

  actions.push({
    href: "/results",
    label: "Re-read your results",
    detail: "The problems that produced these posts, and the posts themselves.",
  });

  actions.push({
    href: "/start",
    label: lastUrl ? "Analyse another URL" : "Analyse your product URL",
    detail: lastUrl
      ? `Last run read ${lastUrl}. A competitor or a new page works too.`
      : "Paste a public product page and the loop starts again.",
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">What came of it</h1>
      <p className="mt-1 text-sm text-muted">
        {published.length === 0
          ? "No post has gone out yet. The receipts land here when they do."
          : `${published.length} post${published.length === 1 ? "" : "s"} published from this workspace.`}
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Receipts</h2>

        {jobs.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
            Nothing has been sent or scheduled yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {job.content_drafts?.topic ?? "Untitled post"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {platformLabel(job.platform)} · {statusLine(job)}
                  </p>
                </div>
                {job.permalink && (
                  <a
                    href={job.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-ink underline"
                  >
                    View post
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Do next</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {actions.map((action) => (
            <li key={action.href + action.label}>
              <Link
                href={action.href}
                className="block rounded-lg border border-line bg-surface p-4 hover:border-ink"
              >
                <p className="text-sm font-medium">{action.label}</p>
                <p className="mt-1 text-sm text-muted">{action.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
