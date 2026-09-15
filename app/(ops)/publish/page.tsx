import Link from "next/link";

import { callerCanApprove } from "@/lib/approvals/repo";
import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { platformLabel } from "@/lib/content/platforms";
import { canCancel, canRetry, type PublishJobStatus } from "@/lib/publish/state";
import { StatusPill } from "../status-pill";
import { cancelJobAction, retryJobAction, runDueNowAction } from "./actions";

type JobRow = {
  id: string;
  draft_id: string;
  status: PublishJobStatus;
  platform: string;
  mode: string;
  actor: string;
  scheduled_for: string;
  attempt_count: number;
  permalink: string | null;
  platform_error: string | null;
  created_at: string;
  content_drafts: { topic: string } | null;
  connected_accounts: { display_name: string } | null;
};

export default async function PublishPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [mayApprove, { data: workspace }, { data: used }, { data }] = await Promise.all([
    callerCanApprove(workspaceId),
    supabase.from("workspaces").select("publish_mode, daily_publish_cap").eq("id", workspaceId).maybeSingle(),
    supabase.rpc("publishes_used_today", { target_workspace: workspaceId }),
    supabase
      .from("publish_jobs")
      .select(
        "id, draft_id, status, platform, mode, actor, scheduled_for, attempt_count, permalink, platform_error, created_at, content_drafts (topic), connected_accounts (display_name)",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const jobs = (data ?? []) as unknown as JobRow[];

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Publish</h1>
          <p className="mt-1 text-sm text-muted">
            Every post, scheduled or sent, with its platform receipt or its error. Each platform
            target has its own status.
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <p>
            mode: <span className="font-medium text-ink">{workspace?.publish_mode?.replace(/_/g, " ")}</span>
          </p>
          <p className="mt-0.5">
            {(used as number | null) ?? 0} / {workspace?.daily_publish_cap ?? 0} publishes today (UTC)
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/settings/connections" className="rounded-md border border-line px-3 py-1.5">
          Connected accounts
        </Link>
        {mayApprove && (
          <form action={runDueNowAction}>
            <button type="submit" className="rounded-md border border-line px-3 py-1.5">
              Run due jobs now
            </button>
          </form>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          Nothing published or scheduled yet. Approve a draft, then publish it from its page.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {jobs.map((job) => (
            <li key={job.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/content/${job.draft_id}`} className="block truncate font-medium">
                    {job.content_drafts?.topic ?? "Draft"}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {platformLabel(job.platform)}
                    {job.connected_accounts?.display_name && ` · ${job.connected_accounts.display_name}`}
                    {" · "}
                    {job.status === "scheduled" ? "scheduled for " : ""}
                    {new Date(job.scheduled_for).toLocaleString()}
                    {job.attempt_count > 1 && ` · ${job.attempt_count} attempts`}
                    {job.actor.startsWith("rule:") && " · by auto rule"}
                  </p>
                </div>
                <StatusPill status={job.status} />
              </div>

              {job.permalink && (
                <a href={job.permalink} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                  View the post
                </a>
              )}
              {job.platform_error && <p className="mt-1 text-xs text-red-700">{job.platform_error}</p>}

              {mayApprove && (canRetry(job.status) || canCancel(job.status)) && (
                <div className="mt-2 flex gap-3">
                  {canRetry(job.status) && (
                    <form action={retryJobAction}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <button type="submit" className="text-xs underline">
                        Retry now
                      </button>
                    </form>
                  )}
                  {canCancel(job.status) && (
                    <form action={cancelJobAction}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <button type="submit" className="text-xs text-muted underline">
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
