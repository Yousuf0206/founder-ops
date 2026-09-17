import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { packAngleSchema, isPublishablePlatform, type PackAngle } from "@/lib/growth/pack";
import { GeneratePack } from "./generate-pack";
import { PackPost, type PackPostView } from "./pack-post";

/**
 * Pack — destination 3 of 5 (work order P2).
 *
 * Shows the most recent pack for the active workspace: its angles, and the
 * posts written from them, editable in place. Publishing is not done here —
 * Publish is its own destination, and this screen's job ends at "these are
 * ready and they say what I want them to say".
 */

export const metadata = {
  title: "Pack — Lumo Grow",
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

/** jsonb is re-validated on read rather than trusted, as on Hurdles. */
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
    edited: draft.original_payload !== null,
  };
}

export default async function PackPage() {
  const session = await getOpsSession();

  // No workspace means nothing has ever been analysed, let alone packed.
  if (!session) redirect("/start");

  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const { data: packData } = await supabase
    .from("growth_packs")
    .select("id, analyze_run_id, angles, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pack = packData as PackRow | null;

  if (!pack) {
    // The empty state is a working screen, not a 404 — which is what /pack was.
    const { count } = await supabase
      .from("analyze_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded");

    const hasHurdles = (count ?? 0) > 0;

    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your growth pack</h1>
        <p className="mt-2 text-sm text-muted">
          {hasHurdles
            ? "Angles and posts, written from your hurdles."
            : "A pack is written from your hurdles, so those come first."}
        </p>

        <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm">
          {hasHurdles ? (
            <>
              <p className="font-medium">No pack yet.</p>
              <p className="mt-1 text-muted">
                Generate one from the hurdles we found on your page.
              </p>
              <div className="mt-4">
                <GeneratePack />
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
      </div>
    );
  }

  const { data: draftData } = await supabase
    .from("content_drafts")
    .select("id, topic, platform, status, payload_json, original_payload")
    .eq("workspace_id", workspaceId)
    .eq("growth_pack_id", pack.id)
    .order("created_at", { ascending: true });

  const posts = ((draftData ?? []) as DraftRow[]).map(toView);
  const angles = parseAngles(pack.angles);
  const publishable = posts.filter((post) => post.publishable);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your growth pack</h1>
        <Link href="/hurdles" className="text-sm text-muted hover:text-fg">
          Back to hurdles
        </Link>
      </div>

      {angles.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Angles</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {angles.map((angle, index) => (
              <li
                key={`${index}-${angle.angle}`}
                className="rounded-lg border border-line bg-surface p-4 text-sm"
              >
                <p className="font-medium">{angle.angle}</p>
                {angle.hurdle && (
                  <p className="mt-1 text-muted">Answers: {angle.hurdle}</p>
                )}
                {angle.rationale && <p className="mt-1">{angle.rationale}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            Posts <span className="text-muted">({posts.length})</span>
          </h2>
          <p className="text-xs text-muted">
            {publishable.length} can publish · {posts.length - publishable.length} draft only
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            This pack has no posts. Generate another.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {posts.map((post) => (
              <PackPost key={post.id} post={post} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
        {publishable.length > 0 && (
          <Link
            href="/publish"
            className="rounded-md bg-accent px-4 py-2.5 text-center text-sm font-medium text-white"
          >
            Approve and publish
          </Link>
        )}
        <GeneratePack label="Generate a new pack" />
      </div>
    </div>
  );
}
