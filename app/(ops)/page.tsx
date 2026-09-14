import { getOpsSession } from "@/lib/auth/session";

/**
 * Home placeholder (T0.8). Deliberately empty of features — Phase 0's DoD is
 * "owner logs in and sees an empty Home", not a dashboard.
 */
export default async function HomePage() {
  const session = await getOpsSession();
  if (!session) return null; // layout gate has already redirected

  const { activeWorkspace, memberships } = session;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{activeWorkspace.workspaceName}</h1>
      <p className="mt-1 text-sm text-muted">
        Workspace <code className="text-xs">{activeWorkspace.workspaceSlug}</code> · you are{" "}
        {activeWorkspace.role}
      </p>

      <div className="mt-8 rounded-lg border border-line bg-surface p-6">
        <h2 className="text-sm font-medium">Nothing here yet</h2>
        <p className="mt-2 text-sm text-muted">
          Phase 0 is the foundation: auth, workspace, membership, and row-level isolation.
          Knowledge, Research, Content, and Approvals arrive in Phases 1–3.
        </p>
      </div>

      {memberships.length > 1 && (
        <p className="mt-4 text-xs text-muted">
          You belong to {memberships.length} workspaces. Switching is not built yet — the first
          one is active.
        </p>
      )}
    </div>
  );
}
