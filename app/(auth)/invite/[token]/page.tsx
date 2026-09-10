import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Invitation redemption (T0.10, FR-Q-007).
 *
 * The invitee is not yet a member, so they cannot see the workspace row. All
 * the work happens inside accept_invitation(), a SECURITY DEFINER function
 * that checks the token is live and addressed to the caller's own email before
 * creating the membership.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sign in first, then come back to this same URL.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const { error } = await supabase.rpc("accept_invitation", {
    invitation_token: token,
  });

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-lg font-semibold">This invitation cannot be used</h1>
        <p className="mt-2 text-sm text-[--color-muted]">{error.message}</p>
        <p className="mt-4 text-sm text-[--color-muted]">
          You are signed in as {user.email}. If the invitation was sent to a different address,
          sign out and sign in with that one.
        </p>
      </div>
    );
  }

  redirect("/");
}
