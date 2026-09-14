import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  getOpsSession,
} from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/db/server";
import { firstIssue } from "@/lib/validation/auth";
import { MAX_OWNED_WORKSPACES, workspaceCreateSchema } from "@/lib/validation/workspace";

/**
 * Self-serve workspace creation. Any signed-in user can create a workspace and
 * becomes its owner; each workspace is one app (Constitution VI).
 *
 * `workspaces` has no INSERT policy for `authenticated`, so creation runs on
 * the service-role client — but only after the caller's identity comes from
 * their own session, never from the form.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent("/onboarding")}`);

  async function createWorkspace(formData: FormData) {
    "use server";

    // Defined inside the action: a server action cannot capture functions from
    // the component body, because captured values are serialized.
    const back = (message: string) => `/onboarding?error=${encodeURIComponent(message)}`;

    const server = await createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await server.auth.getUser();
    if (!caller) redirect(`/login?next=${encodeURIComponent("/onboarding")}`);

    const parsed = workspaceCreateSchema.safeParse({
      name: formData.get("name"),
      slug: formData.get("slug"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const admin = createSupabaseAdminClient();

    const { count, error: countError } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", caller.id)
      .eq("role", "owner");
    if (countError) redirect(back("Could not create the workspace. Try again."));
    if ((count ?? 0) >= MAX_OWNED_WORKSPACES) {
      redirect(back(`You can own up to ${MAX_OWNED_WORKSPACES} workspaces.`));
    }

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .insert(parsed.data)
      .select("id")
      .single();
    if (workspaceError || !workspace) {
      redirect(
        back(
          workspaceError?.code === "23505"
            ? `The URL "${parsed.data.slug}" is taken. Choose another.`
            : "Could not create the workspace. Try again.",
        ),
      );
    }

    const { error: membershipError } = await admin
      .from("memberships")
      .insert({ user_id: caller.id, workspace_id: workspace.id, role: "owner" });
    if (membershipError) {
      // No orphan tenants: a workspace without an owner is unreachable.
      await admin.from("workspaces").delete().eq("id", workspace.id);
      redirect(back("Could not create the workspace. Try again."));
    }

    // Land in the workspace just created, not whichever was active before.
    (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspace.id, activeWorkspaceCookieOptions);

    redirect("/");
  }

  const session = await getOpsSession();
  const hasWorkspace = Boolean(session);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">
        {hasWorkspace ? "Create another workspace" : "Create your workspace"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        A workspace holds one app&apos;s knowledge base, content, leads, and campaigns.
      </p>

      {params.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {params.error}
        </p>
      )}

      <form action={createWorkspace} className="mt-6 flex flex-col gap-3">
        <label className="text-sm" htmlFor="name">
          Workspace name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
          placeholder="My App"
        />
        <label className="text-sm" htmlFor="slug">
          URL name <span className="text-muted">(optional)</span>
        </label>
        <input
          id="slug"
          name="slug"
          maxLength={60}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
          placeholder="my-app"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          Create workspace
        </button>
      </form>

      <form action="/auth/sign-out" method="post" className="mt-6">
        <p className="text-sm text-muted">
          Signed in as {user.email}.{" "}
          <button type="submit" className="font-medium text-ink underline">
            Sign out
          </button>
        </p>
      </form>
    </div>
  );
}
