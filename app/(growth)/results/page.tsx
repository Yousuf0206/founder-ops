import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { hurdleSchema, type Hurdle } from "@/lib/growth/analyze";
import { packAngleSchema, isPublishablePlatform, type PackAngle } from "@/lib/growth/pack";
import { acceptsImage, acceptsVideo, hasRequiredMedia, mediaRequirementReason } from "@/lib/connectors/registry";
import { GeneratePack } from "./generate-pack";
import { PackPost, type PackPostView } from "./pack-post";
import { ResultsTabs } from "./results-tabs";

/**
 * Results — destination 2 of 2 (6.0.0-subtraction, FR-03).
 *
 * This screen is the merge of what used to be /hurdles and /pack. Those were
 * two of five primary destinations, which meant a founder who pasted a URL
 * landed on a list of problems, had to recognise that "Generate pack" was the
 * way forward, and then had to understand that "Pack" was a different place
 * where the output lived. The work the product does is one thing — here is
 * what is wrong, here is what to post about it — so it is one screen with two
 * in-page tabs, which the constitution caps at exactly that.
 *
 * Posts is the default tab whenever posts exist: the copyable output is the
 * outcome, and the problems are the reasoning behind it. Problems leads only
 * when there is nothing written yet, because then the one thing to do is
 * generate.
 *
 * Nothing on this screen requires a visit to Knowledge or an approved claim
 * set (constitution R5): the analysis seeds product facts, and the facts bind
 * the pack.
 */

export const metadata = {
  title: "Results — Lumo Grow",
};

type AnalyzeRunRow = {
  id: string;
  source_url: string;
  status: "running" | "succeeded" | "failed";
  hurdles: unknown;
  error: string | null;
  created_at: string;
};

type PackRow = {
  id: string;
  analyze_run_id: string;
  angles: unknown;
  created_at: string;
};

type DraftRow = {
  id: string;
  topic: string;
  platform: string;
  status: string;
  payload_json: unknown;
  original_payload: unknown;
};

/** Model output is stored as jsonb; re-validate on read rather than trusting the column. */
function parseHurdles(raw: unknown): Hurdle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = hurdleSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

function parseAngles(raw: unknown): PackAngle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = packAngleSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

function toView(draft: DraftRow): PackPostView {
  const payload = (draft.payload_json ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");

  return {
    id: draft.id,
    topic: draft.topic,
    platform: draft.platform,
    status: draft.status,
    hook: str("hook"),
    script: str("script"),
    cta: str("cta"),
    hashtags: Array.isArray(payload.hashtags)
      ? (payload.hashtags as unknown[]).filter((tag): tag is string => typeof tag === "string")
      : [],
    angle: str("angle"),
    publishable: isPublishablePlatform(draft.platform),
    // 007: what this platform will take, and whether this post has it. The
    // card shows only the fields its own platform can use.
    acceptsImage: acceptsImage(draft.platform),
    acceptsVideo: acceptsVideo(draft.platform),
    imageUrl: str("image_url"),
    videoUrl: str("video_url"),
    mediaReason: hasRequiredMedia(draft.platform, {
      imageUrl: str("image_url"),
      videoUrl: str("video_url"),
    })
      ? null
      : mediaRequirementReason(draft.platform),
    edited: draft.original_payload !== null,
  };
}

export default async function ResultsPage() {
  const session = await getOpsSession();

  // No workspace yet means nothing has ever been analysed: Start owns that case
  // rather than this screen showing an empty shell.
  if (!session) redirect("/start");

  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [{ data: runData }, { data: packData }] = await Promise.all([
    supabase
      .from("analyze_runs")
      .select("id, source_url, status, hurdles, error, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("growth_packs")
      .select("id, analyze_run_id, angles, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const run = runData as AnalyzeRunRow | null;
  if (!run) redirect("/start");

  const pack = packData as PackRow | null;

  const { data: draftData } = pack
    ? await supabase
        .from("content_drafts")
        .select("id, topic, platform, status, payload_json, original_payload")
        .eq("workspace_id", workspaceId)
        .eq("growth_pack_id", pack.id)
        .order("created_at", { ascending: true })
    : { data: [] as DraftRow[] };

  const hurdles = parseHurdles(run.hurdles);
  const angles = pack ? parseAngles(pack.angles) : [];
  const posts = ((draftData ?? []) as DraftRow[]).map(toView);

  /*
   * 005 D-3. The latest pack is not necessarily this run's pack: a founder who
   * analyses a second URL has a pack belonging to the first. Opening Posts on
   * it, under a header naming the URL they just submitted, presents another
   * product's posts as the result of this analysis.
   *
   * So posts lead only when they were written from the run on screen. Otherwise
   * the problems lead — they are what this run actually produced — and the Posts
   * tab says plainly where its posts came from instead of quietly implying.
   */
  const postsMatchRun = pack?.analyze_run_id === run.id;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your results</h1>
        <p className="break-all text-sm text-muted">{run.source_url}</p>
      </div>

      <ResultsTabs
        defaultTab={posts.length > 0 && postsMatchRun ? "posts" : "problems"}
        postCount={posts.length}
        problems={
          <ProblemsPanel run={run} hurdles={hurdles} hasPosts={posts.length > 0} />
        }
        posts={
          <PostsPanel
            posts={posts}
            angles={angles}
            hurdleCount={hurdles.length}
            fromThisRun={postsMatchRun}
          />
        }
      />
    </div>
  );
}

function ProblemsPanel({
  run,
  hurdles,
  hasPosts,
}: {
  run: AnalyzeRunRow;
  hurdles: Hurdle[];
  hasPosts: boolean;
}) {
  return (
    <div>
      {/* Running / failed / read-but-empty, each with the one thing to do next.
          A failure of ours is never described as a problem with their page
          (constitution R6) — the sentence comes from the run's own error. */}
      {run.status === "running" && (
        <StatusCard tone="info">
          <p className="font-medium">Still reading your site.</p>
          <p className="mt-1">This usually takes under two minutes. Refresh to check.</p>
        </StatusCard>
      )}

      {run.status === "failed" && (
        <StatusCard tone="warn">
          <p className="font-medium">That run didn&rsquo;t finish.</p>
          <p className="mt-1">{run.error ?? "The run failed before it produced anything."}</p>
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

                {hurdle.explanation && <p className="mt-2 text-sm">{hurdle.explanation}</p>}

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

          <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-start">
            {/* Generating is an action on this panel, never a destination. When
                posts already exist it is the secondary way to get a fresh set,
                so the label says so. */}
            <GeneratePack label={hasPosts ? "Write a new set of posts" : "Write my posts"} />
            <Link href="/start" className="text-sm text-muted hover:text-fg sm:pt-2.5">
              Analyse a different URL
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function PostsPanel({
  posts,
  angles,
  hurdleCount,
  fromThisRun,
}: {
  posts: PackPostView[];
  angles: PackAngle[];
  hurdleCount: number;
  fromThisRun: boolean;
}) {
  if (posts.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm">
        {hurdleCount > 0 ? (
          <>
            <p className="font-medium">No posts written yet.</p>
            <p className="mt-1 text-muted">
              They are written from the problems we found on your page.
            </p>
            <div className="mt-4">
              <GeneratePack label="Write my posts" />
            </div>
          </>
        ) : (
          <>
            <p className="font-medium">Nothing to write from yet.</p>
            <p className="mt-1 text-muted">
              Paste your product URL and we&rsquo;ll read your page first.
            </p>
            <Link
              href="/start"
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white"
            >
              Start here
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {!fromThisRun && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">These posts are from an earlier analysis.</p>
          <p className="mt-1">
            They were not written from the page above. Write a new set to get posts that
            answer the problems on this run.
          </p>
          <div className="mt-3">
            <GeneratePack label="Write posts for this page" />
          </div>
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {posts.map((post) => (
          <PackPost key={post.id} post={post} />
        ))}
      </ul>

      {angles.length > 0 && (
        <details className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm">
          {/* The angles are the reasoning behind the posts. Useful, but not the
              outcome — so they are available, not in the way. */}
          <summary className="cursor-pointer font-medium">
            Why these posts ({angles.length} angle{angles.length === 1 ? "" : "s"})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {angles.map((angle, index) => (
              <li key={`${index}-${angle.angle}`}>
                <p className="font-medium">{angle.angle}</p>
                {angle.hurdle && <p className="mt-1 text-muted">Answers: {angle.hurdle}</p>}
                {angle.rationale && <p className="mt-1">{angle.rationale}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-6 border-t border-line pt-6">
        <GeneratePack label="Write a new set of posts" />
      </div>
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
    tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-surface";

  return <div className={`mt-6 rounded-lg border p-4 text-sm ${palette}`}>{children}</div>;
}
