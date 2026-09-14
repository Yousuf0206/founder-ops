import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { callerCanApprove, getDraft, listApprovalsFor } from "@/lib/approvals/repo";
import type { ContentPayload } from "@/lib/ai/content";
import { StatusPill } from "../../status-pill";
import { DecisionPanel } from "./decision-panel";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;

  const draft = await getDraft(workspaceId, id);
  if (!draft) notFound();

  const [approvals, mayApprove] = await Promise.all([
    listApprovalsFor(workspaceId, id),
    callerCanApprove(workspaceId),
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
            {draft.platform}
            {draft.audience && ` · ${draft.audience}`}
            {draft.tone && ` · ${draft.tone}`}
          </p>
        </div>
        <StatusPill status={draft.status} />
      </div>

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
