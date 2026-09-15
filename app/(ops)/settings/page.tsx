import Link from "next/link";

import { isOwner } from "@/lib/auth/session";
import { requireSession } from "@/lib/knowledge/repo";
import { capStatus } from "@/lib/ai/run";
import { createSupabaseServerClient } from "@/lib/db/server";
import { requestOrigin } from "@/lib/http/origin";
import { SettingsForm } from "./settings-form";
import { removeMemberAction, setApprovalRightAction } from "./actions";
import { IngestSecretForm } from "./ingest-secret-form";
import { Invitations } from "./invitations";

export default async function SettingsPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const owner = isOwner(session.activeWorkspace.role);
  const supabase = await createSupabaseServerClient();

  const [origin, cap, { data: workspace }, { data: members }] = await Promise.all([
    requestOrigin(),
    capStatus(workspaceId),
    supabase
      .from("workspaces")
      .select("name, slug, plan, notify_email, ingest_secret_hash")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, user_id, role, can_approve, profiles (email)")
      .eq("workspace_id", workspaceId),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        {workspace?.name} · <code className="text-xs">{workspace?.slug}</code> · {workspace?.plan} plan
      </p>

      <nav className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/settings/modes" className="rounded-md border border-line px-3 py-1.5">
          Publishing controls →
        </Link>
        <Link href="/settings/connections" className="rounded-md border border-line px-3 py-1.5">
          Connected accounts →
        </Link>
      </nav>

      {owner ? (
        <SettingsForm
          cap={cap.cap}
          notifyEmail={workspace?.notify_email ?? ""}
          used={cap.used}
        />
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Daily AI run cap: {cap.used} of {cap.cap} used today. Only an owner can change
          workspace settings.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium">Members</h2>
        <p className="mt-1 text-sm text-muted">
          Owners always approve. Editors approve only when granted. Viewers never. Removing someone
          ends their access to everything in this workspace at once.
        </p>

        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {(members ?? []).map((member) => {
            const profile = member.profiles as unknown as { email: string } | null;
            const isSelf = member.user_id === session.userId;
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{profile?.email ?? "unknown"}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-muted">
                    {member.role}
                    {isSelf && " · you"}
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  {member.role === "editor" && owner ? (
                    <form action={setApprovalRightAction}>
                      <input type="hidden" name="membership_id" value={member.id} />
                      <input
                        type="hidden"
                        name="can_approve"
                        value={member.can_approve ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-line px-2 py-1 text-xs"
                      >
                        {member.can_approve ? "Revoke approval rights" : "Grant approval rights"}
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted">
                      {member.role === "owner" || member.can_approve ? "can approve" : "cannot approve"}
                    </span>
                  )}

                  {owner && !isSelf && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="membership_id" value={member.id} />
                      <button type="submit" className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">
                        Remove
                      </button>
                    </form>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {owner && <Invitations workspaceId={workspaceId} />}

      <section className="mt-10">
        <h2 className="text-sm font-medium">Lead ingest</h2>
        <p className="mt-1 text-sm text-muted">
          Send leads from your app with a POST to{" "}
          <code className="text-xs">{origin}/api/ops/leads/ingest</code> and the headers{" "}
          <code className="text-xs">x-lumo-ops-workspace: {workspace?.slug ?? "<slug>"}</code>{" "}
          and <code className="text-xs">x-lumo-ops-secret</code>.
        </p>
        <p className="mt-2 text-sm text-muted">
          {workspace?.ingest_secret_hash
            ? "An ingest secret is set. It is stored hashed and cannot be shown again."
            : "No ingest secret set — the lead webhook will reject every request."}
        </p>
        {owner && <IngestSecretForm hasSecret={Boolean(workspace?.ingest_secret_hash)} />}
      </section>
    </div>
  );
}
