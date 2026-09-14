import Link from "next/link";

import { requireSession } from "@/lib/knowledge/repo";
import { callerCanApprove, listDrafts } from "@/lib/approvals/repo";
import { StatusPill } from "../status-pill";

export default async function ApprovalsPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;

  const [pending, decided, mayApprove] = await Promise.all([
    listDrafts(workspaceId, ["awaiting_approval", "draft"]),
    listDrafts(workspaceId, ["approved", "rejected", "published"]),
    callerCanApprove(workspaceId),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-muted">
        Everything the bots produced, waiting on a person. Approving does not publish —
        publishing happens manually, outside this app.
      </p>

      {!mayApprove && (
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          You can read this queue but not decide on it. An owner can grant approval rights in
          Settings.
        </p>
      )}

      <h2 className="mt-8 text-sm font-medium">
        Pending{pending.length > 0 && ` (${pending.length})`}
      </h2>
      {pending.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          Nothing is waiting for review.
        </p>
      ) : (
        <DraftList drafts={pending} />
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-medium">Decided</h2>
          <DraftList drafts={decided} />
        </>
      )}
    </div>
  );
}

function DraftList({
  drafts,
}: {
  drafts: Awaited<ReturnType<typeof listDrafts>>;
}) {
  return (
    <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <Link
            href={`/content/${draft.id}`}
            className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-ground"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{draft.topic}</span>
              <span className="text-xs text-muted">
                {draft.platform} · {new Date(draft.created_at).toLocaleDateString()}
              </span>
            </span>
            <StatusPill status={draft.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
