import Link from "next/link";

import { getOpsSession } from "@/lib/auth/session";
import { getClaimSet } from "@/lib/knowledge/repo";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { createSupabaseServerClient } from "@/lib/db/server";
import { platformLabel } from "@/lib/content/platforms";
import { StatusPill } from "./status-pill";

/**
 * Home (002 T4.6): the core loop at a glance — knowledge → analyze → ideas →
 * drafts → approve → publish → learn — with the single next step called out.
 */
export default async function HomePage() {
  const session = await getOpsSession();
  if (!session) return null; // layout gate has already redirected

  const { activeWorkspace } = session;
  const workspaceId = activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const count = (table: string, filter: (q: any) => any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    filter(supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId));

  const [
    claimSet,
    { data: workspace },
    { count: analyses },
    { count: ideas },
    { count: pendingApprovals },
    { count: accounts },
    { count: pendingProposals },
    { count: hotLeads },
    { data: recentJobs },
    { data: latestSummary },
  ] = await Promise.all([
    getClaimSet(workspaceId),
    supabase.from("workspaces").select("publish_mode, daily_publish_cap").eq("id", workspaceId).maybeSingle(),
    count("analyze_runs", (q) => q.eq("status", "succeeded")),
    count("strategy_ideas", (q) => q.eq("status", "proposed")),
    count("content_drafts", (q) => q.eq("status", "awaiting_approval")),
    count("connected_accounts", (q) => q.eq("status", "active").is("revoked_at", null)),
    count("knowledge_proposals", (q) => q.eq("status", "pending")),
    count("leads", (q) => q.gte("score", 70).in("stage", ["new", "classified"])),
    supabase
      .from("publish_jobs")
      .select("id, draft_id, status, platform, scheduled_for, content_drafts (topic)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("learn_summaries")
      .select("created_at, suggested_topics")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const claimsReady = Boolean(claimSet && hasApprovedClaims(claimSet));
  const jobs = (recentJobs ?? []) as unknown as {
    id: string;
    draft_id: string;
    status: string;
    platform: string;
    scheduled_for: string;
    content_drafts: { topic: string } | null;
  }[];
  const nextTopic = (latestSummary?.suggested_topics as { topic: string }[] | undefined)?.[0]?.topic;

  const next: { text: string; href: string } = !claimsReady
    ? { text: "Add approved claims — nothing generates or publishes without them.", href: "/knowledge/claims" }
    : (analyses ?? 0) === 0
      ? { text: "Analyse your product page.", href: "/analyze" }
      : (ideas ?? 0) === 0 && (pendingApprovals ?? 0) === 0
        ? { text: "Turn research or an analysis into scored campaign ideas.", href: "/strategy" }
        : (pendingApprovals ?? 0) > 0
          ? { text: `Review ${pendingApprovals} draft${pendingApprovals === 1 ? "" : "s"} waiting for approval.`, href: "/approvals" }
          : (accounts ?? 0) === 0
            ? { text: "Connect an account so approved drafts can publish.", href: "/settings/connections" }
            : { text: "Draft assets from your best idea.", href: "/strategy" };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">{activeWorkspace.workspaceName}</h1>
      <p className="mt-1 text-sm text-muted">
        You are {activeWorkspace.role} · publish mode{" "}
        <span className="font-medium text-ink">{workspace?.publish_mode?.replace(/_/g, " ")}</span>
      </p>

      <Link
        href={next.href}
        className="mt-6 block rounded-lg border border-accent/40 bg-surface p-4 text-sm hover:bg-ground"
      >
        <span className="text-xs uppercase tracking-wide text-muted">Next step</span>
        <span className="mt-1 block font-medium">{next.text} →</span>
      </Link>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stage n={1} title="Product truth" href="/knowledge/claims" value={claimsReady ? "claims set" : "no approved claims"} warn={!claimsReady} />
        <Stage n={2} title="Analyses" href="/analyze" value={`${analyses ?? 0} saved`} />
        <Stage n={3} title="Ideas" href="/strategy" value={`${ideas ?? 0} to draft`} />
        <Stage n={4} title="Approvals" href="/approvals" value={`${pendingApprovals ?? 0} waiting`} warn={(pendingApprovals ?? 0) > 0} />
        <Stage n={5} title="Publishing" href="/publish" value={`${accounts ?? 0} account${accounts === 1 ? "" : "s"} connected`} />
        <Stage n={6} title="Learn" href="/insights" value={`${pendingProposals ?? 0} proposal${pendingProposals === 1 ? "" : "s"} to review`} warn={(pendingProposals ?? 0) > 0} />
      </ol>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium">Recent publishing</h2>
          {jobs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing published or scheduled yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Link href={`/content/${job.draft_id}`} className="min-w-0 truncate">
                    {job.content_drafts?.topic ?? "Draft"}
                    <span className="ml-1 text-xs text-muted">{platformLabel(job.platform)}</span>
                  </Link>
                  <StatusPill status={job.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium">Signals</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/leads" className="underline">
                {hotLeads ?? 0} high-intent lead{hotLeads === 1 ? "" : "s"}
              </Link>{" "}
              <span className="text-muted">to contact manually</span>
            </li>
            <li>
              {nextTopic ? (
                <>
                  <span className="text-muted">Suggested next topic: </span>
                  <Link href="/insights" className="underline">
                    {nextTopic}
                  </Link>
                </>
              ) : (
                <span className="text-muted">No learn summary yet.</span>
              )}
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stage({ n, title, href, value, warn }: { n: number; title: string; href: string; value: string; warn?: boolean }) {
  return (
    <li>
      <Link href={href} className="block rounded-lg border border-line bg-surface p-3 hover:bg-ground">
        <span className="text-xs text-muted">
          {n}. {title}
        </span>
        <span className={`mt-1 block text-sm font-medium ${warn ? "text-amber-700" : ""}`}>{value}</span>
      </Link>
    </li>
  );
}
