import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession, isOwner } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { platformLabel } from "@/lib/content/platforms";
import { isPublishablePlatform } from "@/lib/growth/pack";
import type { PublishJobStatus } from "@/lib/publish/state";
import { PublishPost, type PublishPostView } from "./publish-post";
import { RetryJob } from "./retry-job";

/**
 * Publish — destination 4 of 5 (004 T-4.3, SC-05).
 *
 * Until this existed, the Instant nav's Publish entry rendered the ops job
 * board in the ops shell: a founder three screens into their first run was
 * dropped into an operator console with thirteen nav items. Constitution R2
 * says the primary path is five screens; this is the fourth.
 *
 * It is NOT a second publish implementation. Connect, approve, enqueue and
 * execute are the existing paths (`/api/ops/connections/:platform`,
 * `decide_on_draft()`, `enqueue_publish_job()`, `executePublishJob()`), so the
 * cap, the forbidden check on the final body and the idempotent retry behave
 * identically here and on the ops board. What differs is what is shown: this
 * workspace's pack posts and their receipts, and nothing else.
 *
 * The full board — schedules, auto rules, every platform target, cancel — stays
 * at /advanced/publish for whoever wants it.
 */

export const metadata = {
  title: "Publish — Lumo Grow",
};

type JobRow = {
  id: string;
  draft_id: string;
  status: PublishJobStatus;
  platform: string;
  permalink: string | null;
  platform_error: string | null;
  created_at: string;
  content_drafts: { topic: string } | null;
};

type DraftRow = {
  id: string;
  topic: string;
  platform: string;
  status: string;
  payload_json: unknown;
};

/**
 * The body a founder is approving, assembled from the stored payload.
 *
 * This is for reading, not for publishing: the connector composes the real body
 * from the same payload at send time, so nothing shown here can change what
 * goes out.
 */
function previewBody(payload: unknown): string {
  const record = (payload ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  const hashtags = Array.isArray(record.hashtags)
    ? (record.hashtags as unknown[]).filter((tag): tag is string => typeof tag === "string")
    : [];

  return [text("hook"), text("script"), text("cta"), hashtags.join(" ")]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
}

export default async function InstantPublishPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const session = await getOpsSession();

  // Nothing has been analysed, so there is nothing to publish. Start owns that.
  if (!session) redirect("/start");

  const params = await searchParams;
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [{ data: accounts }, { data: draftData }, { data: jobData }, { data: workspace }, { data: used }] =
    await Promise.all([
      supabase
        .from("connected_accounts")
        .select("id, platform, display_name")
        .eq("workspace_id", workspaceId)
        .is("revoked_at", null)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      supabase
        .from("content_drafts")
        .select("id, topic, platform, status, payload_json")
        .eq("workspace_id", workspaceId)
        .in("status", ["draft", "awaiting_approval", "approved"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("publish_jobs")
        .select(
          "id, draft_id, status, platform, permalink, platform_error, created_at, content_drafts (topic)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("workspaces")
        .select("daily_publish_cap")
        .eq("id", workspaceId)
        .maybeSingle(),
      supabase.rpc("publishes_used_today", { target_workspace: workspaceId }),
    ]);

  const connected = accounts ?? [];
  // One connector this milestone (plan Phase 4), so one target: the first
  // active LinkedIn account. The ops board is where multiple targets are chosen.
  const target = connected.find((a) => isPublishablePlatform(a.platform)) ?? null;

  const posts: PublishPostView[] = ((draftData ?? []) as DraftRow[]).map((draft) => ({
    id: draft.id,
    topic: draft.topic,
    platform: draft.platform,
    status: draft.status,
    body: previewBody(draft.payload_json),
    publishable: isPublishablePlatform(draft.platform),
  }));

  const jobs = (jobData ?? []) as unknown as JobRow[];
  const cap = (workspace as { daily_publish_cap?: number } | null)?.daily_publish_cap ?? null;
  const usedToday = typeof used === "number" ? used : null;
  const canConnect = isOwner(session.activeWorkspace.role);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Publish</h1>
        {cap !== null && usedToday !== null && (
          <p className="text-xs text-muted">
            {usedToday} of {cap} posts sent today
          </p>
        )}
      </div>

      {params.error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {params.error}
        </p>
      )}
      {params.connected && (
        <p className="mt-4 text-sm text-green-700">Connected {params.connected}.</p>
      )}

      {/* 1 — the channel. Nothing can ship without one, so it comes first. */}
      <section className="mt-6 rounded-lg border border-line bg-surface p-4">
        {target ? (
          <p className="text-sm">
            Publishing to <span className="font-medium">{target.display_name || platformLabel(target.platform)}</span>
            {" · "}
            <Link href="/settings/connections" className="text-muted underline">
              manage
            </Link>
          </p>
        ) : canConnect ? (
          <>
            <p className="text-sm font-medium">Connect a channel</p>
            <p className="mt-1 text-sm text-muted">
              One account is enough to finish the loop. Your tokens stay on our server and
              never reach the browser.
            </p>
            <a
              href="/api/ops/connections/linkedin?from=instant"
              className="mt-3 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              Connect LinkedIn
            </a>
          </>
        ) : (
          <p className="text-sm text-muted">
            No channel is connected yet, and only a workspace owner can connect one.
          </p>
        )}
      </section>

      {/* 2 — the posts, each showing only the action it is waiting for. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your posts
        </h2>

        {posts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
            No posts are waiting.{" "}
            <Link href="/pack" className="underline">
              Generate a pack
            </Link>{" "}
            and they appear here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {posts.map((post) => (
              <PublishPost
                key={post.id}
                post={post}
                accountId={target?.id ?? null}
                accountName={target?.display_name || null}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 3 — the receipt. The thing SC-05 actually asks for. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Receipts</h2>

        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing has been sent yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {job.content_drafts?.topic ?? "Untitled post"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {platformLabel(job.platform)} · {job.status}
                    {job.platform_error ? ` — ${job.platform_error}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-3">
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
                  {(job.status === "failed" || job.status === "blocked") && (
                    <RetryJob jobId={job.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Schedules, auto rules and every platform target live in{" "}
        <Link href="/advanced/publish" className="underline">
          Advanced → Publish
        </Link>
        .
      </p>
    </div>
  );
}
