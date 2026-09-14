import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, listDocs, requireSession } from "@/lib/knowledge/repo";

export default async function KnowledgePage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;

  const [docs, claimSet] = await Promise.all([
    listDocs(workspaceId),
    getClaimSet(workspaceId),
  ]);

  const writer = canWrite(session.activeWorkspace.role);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge</h1>
          <p className="mt-1 text-sm text-muted">
            The only source of product claims for this workspace. Everything the bots write is
            built from what is here.
          </p>
        </div>
        {writer && (
          <Link
            href="/knowledge/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
          >
            New doc
          </Link>
        )}
      </div>

      {/* The claim set is the thing that binds prompts, so it leads. */}
      <ClaimSummary claimSet={claimSet} />

      <h2 className="mt-8 text-sm font-medium">Documents</h2>

      {docs.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          No documents yet.
          {writer ? " Add the first one to start building the knowledge base." : ""}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link href={`/knowledge/${doc.id}`} className="block px-4 py-3 hover:bg-ground">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">{doc.title}</span>
                  <span className="shrink-0 text-xs text-muted">{doc.category}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {doc.last_verified_at
                    ? `Verified ${new Date(doc.last_verified_at).toLocaleDateString()}`
                    : "Never verified"}
                  {" · "}
                  Updated {new Date(doc.updated_at).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimSummary({
  claimSet,
}: {
  claimSet: Awaited<ReturnType<typeof getClaimSet>>;
}) {
  // No claim set is a real state, not a rendering edge case: generation refuses
  // until one exists (Constitution III), so say so plainly.
  if (!claimSet) {
    return (
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-medium">No claim set yet</h2>
        <p className="mt-1 text-sm text-muted">
          Research and content generation will refuse to run until this workspace has approved
          and forbidden claims defined.
        </p>
        <Link href="/knowledge/claims" className="mt-3 inline-block text-sm text-accent">
          Set up claims →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Claim set</h2>
        <Link href="/knowledge/claims" className="text-sm text-accent">
          Edit
        </Link>
      </div>
      <dl className="mt-3 flex gap-8 text-sm">
        <div>
          <dt className="text-xs text-muted">Approved claims</dt>
          <dd className="mt-0.5 font-medium">{claimSet.approved_claims.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Forbidden claims</dt>
          <dd className="mt-0.5 font-medium">{claimSet.forbidden_claims.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Brand voice</dt>
          <dd className="mt-0.5 font-medium">
            {claimSet.brand_voice.trim() ? "Defined" : "Not set"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
