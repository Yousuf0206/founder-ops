import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { callerCanApprove, getDraft, listApprovalsFor } from "@/lib/approvals/repo";
import type { ContentPayload } from "@/lib/ai/content";
import { platformLabel } from "@/lib/content/platforms";
import { hasLiveConnector } from "@/lib/connectors/registry";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatusPill } from "../../status-pill";
import { DecisionPanel } from "./decision-panel";
import { PublishPanel } from "./publish-panel";

type JobRow = {
  id: string;
  status: string;
  scheduled_for: string;
  permalink: string | null;
  platform_error: string | null;
};

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;

  const draft = await getDraft(workspaceId, id);
  if (!draft) notFound();

  const supabase = await createSupabaseServerClient();
  const live = hasLiveConnector(draft.platform);

  const [approvals, mayApprove, { data: accounts }, { data: jobs }, { data: workspace }] = await Promise.all([
    listApprovalsFor(workspaceId, id),
    callerCanApprove(workspaceId),
    supabase
      .from("connected_accounts")
      .select("id, display_name")
      .eq("workspace_id", workspaceId)
      .eq("platform", draft.platform.trim().toLowerCase())
      .eq("status", "active")
      .is("revoked_at", null),
    supabase
      .from("publish_jobs")
      .select("id, status, scheduled_for, permalink, platform_error")
      .eq("workspace_id", workspaceId)
      .eq("draft_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("workspaces").select("publish_mode").eq("id", workspaceId).maybeSingle(),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/content" className="text-sm text-muted">
        ← Content
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{draft.topic}</h1>
          <p className="mt-1 text-sm text-muted">
            {platformLabel(draft.platform)}
            {draft.audience && ` · ${draft.audience}`}
            {draft.tone && ` · ${draft.tone}`}
          </p>
        </div>
        <StatusPill status={draft.status} />
      </div>

      {/* 002 T1.10 / US3 AC5: drafting works everywhere; publishing needs a live connector. */}
      {!live && (
        <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-muted">
          Draft only — there is no publish connector for {platformLabel(draft.platform)} yet. Once
          approved, copy it and post it yourself.
        </p>
      )}

      <Payload payload={draft.payload_json} />

      {/* T3.9: when a human edited before approving, both versions stay visible. */}
      {draft.original_payload && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted">
            The model&rsquo;s original, before human edits
          </summary>
          <div className="mt-2 opacity-80">
            <Payload payload={draft.original_payload} />
          </div>
        </details>
      )}

      {mayApprove ? (
        <DecisionPanel draftId={draft.id} payload={draft.payload_json} status={draft.status} />
      ) : (
        <p className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          You do not have approval rights in this workspace.
        </p>
      )}

      {mayApprove && live && draft.status === "approved" && (
        <PublishPanel
          draftId={draft.id}
          accounts={(accounts ?? []) as { id: string; display_name: string }[]}
          mode={workspace?.publish_mode ?? "approve_then_publish"}
        />
      )}

      {(jobs ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Publish history</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {((jobs ?? []) as JobRow[]).map((job) => (
              <li key={job.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted">{new Date(job.scheduled_for).toLocaleString()}</span>
                  <StatusPill status={job.status} />
                </div>
                {job.permalink && (
                  <a href={job.permalink} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                    View the post
                  </a>
                )}
                {job.platform_error && <p className="mt-1 text-xs text-red-700">{job.platform_error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {approvals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Decision history</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {approvals.map((approval) => (
              <li
                key={approval.id}
                className="rounded-lg border border-line bg-surface p-3 text-sm"
              >
                <span className="font-medium">{approval.status.replace(/_/g, " ")}</span>
                <span className="text-muted">
                  {" · "}
                  {new Date(approval.created_at).toLocaleString()}
                </span>
                {approval.notes && <p className="mt-1 text-muted">{approval.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Payload({ payload }: { payload: ContentPayload }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Block title="Hook">{payload.hook}</Block>
      <Block title="Script">{payload.script}</Block>
      <ListBlock title="Titles" items={payload.titles} />
      <ListBlock title="Captions" items={payload.captions} />
      <Block title="Call to action">{payload.cta}</Block>
      <Block title="Visual plan">{payload.visual_plan}</Block>
      {payload.hashtags.length > 0 && (
        <section>
          <h2 className="text-sm font-medium">Hashtags</h2>
          <p className="mt-1 text-sm text-muted">{payload.hashtags.join(" ")}</p>
        </section>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: string }) {
  if (!children) return null;
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm">
        {children}
      </p>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-1 list-inside list-disc rounded-lg border border-line bg-surface p-3 text-sm">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
