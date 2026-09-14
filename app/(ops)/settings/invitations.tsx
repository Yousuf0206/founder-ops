import { createSupabaseServerClient } from "@/lib/db/server";
import { requestOrigin } from "@/lib/http/origin";

import { revokeInvitationAction } from "./actions";
import { InviteForm } from "./invite-form";

/** Owner-only: invite members and manage pending invitation links. */
export async function Invitations({ workspaceId }: { workspaceId: string }) {
  const supabase = await createSupabaseServerClient();
  const [origin, { data: pending }] = await Promise.all([
    requestOrigin(),
    supabase
      .from("invitations")
      .select("id, email, role, token, expires_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const now = Date.now();

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium">Invite members</h2>
      <p className="mt-1 text-sm text-muted">
        Send the invitation link to that person. They sign in or create an account with the
        same email, then join this workspace.
      </p>

      <InviteForm />

      {(pending ?? []).length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {(pending ?? []).map((invite) => {
            const expired = new Date(invite.expires_at).getTime() <= now;
            return (
              <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <span className="font-medium">{invite.email}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted">
                      {invite.role}
                    </span>
                    {expired && <span className="ml-2 text-xs text-red-600">expired</span>}
                  </span>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitation_id" value={invite.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2 py-1 text-xs"
                    >
                      Revoke
                    </button>
                  </form>
                </div>
                {!expired && (
                  <code className="block break-all text-xs text-muted">
                    {`${origin}/invite/${invite.token}`}
                  </code>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
