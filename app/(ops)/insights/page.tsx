import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { platformLabel } from "@/lib/content/platforms";
import { decideProposalAction, refreshMetricsAction } from "./actions";
import { SummaryForm } from "./summary-form";

type Job = {
  id: string;
  platform: string;
  permalink: string | null;
  created_at: string;
  draft_id: string;
  content_drafts: { topic: string } | null;
};
type Snapshot = { publish_job_id: string; available: boolean; metrics: Record<string, unknown>; note: string; fetched_at: string };
type Summary = {
  id: string;
  created_at: string;
  what_worked: { finding: string; evidence_job_ids: string[] }[];
  suggested_topics: { topic: string; why: string; evidence_job_ids: string[] }[];
};
type Proposal = { id: string; kind: string; proposed_text: string; rationale: string; created_at: string };

export default async function InsightsPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const writer = canWrite(session.activeWorkspace.role);
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, { data: jobs }, { data: snapshots }, { data: summaries }, { data: proposals }] =
    await Promise.all([
      getClaimSet(workspaceId),
      capStatus(workspaceId),
      supabase
        .from("publish_jobs")
        .select("id, platform, permalink, created_at, draft_id, content_drafts (topic)")
        .eq("workspace_id", workspaceId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("performance_snapshots")
        .select("publish_job_id, available, metrics, note, fetched_at")
        .eq("workspace_id", workspaceId)
        .order("fetched_at", { ascending: false })
        .limit(300),
      supabase
        .from("learn_summaries")
        .select("id, created_at, what_worked, suggested_topics")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("knowledge_proposals")
        .select("id, kind, proposed_text, rationale, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const published = (jobs ?? []) as unknown as Job[];
  const latest = new Map<string, Snapshot>();
  for (const snapshot of (snapshots ?? []) as Snapshot[]) {
    if (!latest.has(snapshot.publish_job_id)) latest.set(snapshot.publish_job_id, snapshot);
  }

  let disabled: string | undefined;
  if (!writer) disabled = "You have viewer access, so you cannot generate a summary.";
  else if (published.length === 0) disabled = "Nothing has been published yet, so there is nothing to learn from.";
  else if (!claimSet || !hasApprovedClaims(claimSet)) disabled = "Add at least one approved claim first.";
  else if (!isProviderConfigured()) disabled = "No AI provider is configured on the server.";
  else if (cap.used >= cap.cap) disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}).`;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm text-muted">
        What was published, how it performed where platforms say, what worked, and what to change.
        Proposed knowledge edits change nothing until someone accepts them.
      </p>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Published posts</h2>
          <form action={refreshMetricsAction}>
            <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-xs">
              Refresh metrics
            </button>
          </form>
        </div>
        {published.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
            Nothing published yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {published.map((job) => {
              const snapshot = latest.get(job.id);
              return (
                <li key={job.id} className="px-4 py-3 text-sm">
                  <Link href={`/content/${job.draft_id}`} className="font-medium">
                    {job.content_drafts?.topic ?? "Post"}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {platformLabel(job.platform)} · {new Date(job.created_at).toLocaleDateString()}
                    {job.permalink && (
                      <>
                        {" · "}
                        <a href={job.permalink} target="_blank" rel="noreferrer" className="underline">
                          receipt
                        </a>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs">
                    {!snapshot
                      ? "Metrics not fetched yet."
                      : snapshot.available
                        ? Object.entries(snapshot.metrics).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")
                        : `No metrics: ${snapshot.note}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">What worked</h2>
        <SummaryForm disabled={disabled} />
        {((summaries ?? []) as Summary[]).map((summary) => (
          <article key={summary.id} className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="text-xs text-muted">{new Date(summary.created_at).toLocaleString()}</p>
            {summary.what_worked.length > 0 && (
              <ul className="mt-2 list-inside list-disc">
                {summary.what_worked.map((item, index) => (
                  <li key={index}>
                    {item.finding}{" "}
                    <span className="text-xs text-muted">({item.evidence_job_ids.length} post{item.evidence_job_ids.length === 1 ? "" : "s"})</span>
                  </li>
                ))}
              </ul>
            )}
            {summary.suggested_topics.length > 0 && (
              <>
                <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Next topics</h3>
                <ul className="mt-1 flex flex-col gap-1">
                  {summary.suggested_topics.map((topic, index) => (
                    <li key={index}>
                      <span className="font-medium">{topic.topic}</span>
                      {topic.why && <span className="text-muted"> — {topic.why}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Knowledge proposals</h2>
        {((proposals ?? []) as Proposal[]).length === 0 ? (
          <p className="mt-3 text-sm text-muted">No proposals waiting.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {((proposals ?? []) as Proposal[]).map((proposal) => (
              <li key={proposal.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {proposal.kind === "approved_claim_add" ? "Add an approved claim" : "Add a forbidden claim"}
                </p>
                <p className="mt-1 font-medium">{proposal.proposed_text}</p>
                {proposal.rationale && <p className="mt-1 text-muted">{proposal.rationale}</p>}
                {writer && (
                  <div className="mt-3 flex gap-2">
                    <form action={decideProposalAction}>
                      <input type="hidden" name="proposal_id" value={proposal.id} />
                      <input type="hidden" name="accept" value="true" />
                      <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white">
                        Accept
                      </button>
                    </form>
                    <form action={decideProposalAction}>
                      <input type="hidden" name="proposal_id" value={proposal.id} />
                      <input type="hidden" name="accept" value="false" />
                      <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-xs">
                        Reject
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
