import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  getOpsSession,
} from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/db/server";
import { defaultPlan } from "@/lib/plans/entitlements";
import { firstIssue } from "@/lib/validation/auth";
import { workspaceCreateSchema } from "@/lib/validation/workspace";

/**
 * Self-serve workspace creation (002 US1, FR-O-001/002). Any signed-in user can
 * create a workspace for one product and becomes its owner.
 *
 * Creation runs through create_workspace_with_owner() (migration 0008), which
 * enforces the plan's workspace limit under a lock and writes the workspace,
 * owner membership, and audit row together. It is service-role only: the
 * caller's identity comes from their session and the plan from DEFAULT_PLAN —
 * never from the form.
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
      niche: formData.get("niche"),
      primary_url: formData.get("primary_url"),
      goals: formData.get("goals"),
      tone: formData.get("tone"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const admin = createSupabaseAdminClient();
    const { data: workspaceId, error } = await admin.rpc("create_workspace_with_owner", {
      p_owner: caller.id,
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_plan: defaultPlan(),
      p_niche: parsed.data.niche,
      p_primary_url: parsed.data.primary_url || null,
      p_goals: parsed.data.goals,
      p_tone: parsed.data.tone,
    });

    if (error || !workspaceId) {
      if (error?.code === "23505") {
        redirect(back(`The URL "${parsed.data.slug}" is taken. Choose another.`));
      }
      if (error?.message && /workspace limit reached/i.test(error.message)) {
        redirect(back(`You have reached your plan's workspace limit (${error.message}).`));
      }
      console.error(error);
      redirect(back("Could not create the workspace. Try again."));
    }

    // Land in the workspace just created, not whichever was active before.
    (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId as string, activeWorkspaceCookieOptions);

    redirect("/");
  }

  const session = await getOpsSession();
  const hasWorkspace = Boolean(session);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">
        {hasWorkspace ? "Create another workspace" : "Create your workspace"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        A workspace holds one product&apos;s knowledge, claims, content, publishing, and leads.
      </p>

      {params.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {params.error}
        </p>
      )}

      <form action={createWorkspace} className="mt-6 flex flex-col gap-3">
        <Field label="Workspace name" name="name" required maxLength={120} placeholder="My App" />
        <Field label="URL name" name="slug" maxLength={60} placeholder="my-app" />
        <Field label="Niche" name="niche" maxLength={200} placeholder="Exam prep for matric students" />
        <Field
          label="Primary URL"
          name="primary_url"
          type="url"
          maxLength={2000}
          placeholder="https://myapp.example"
        />
        <label className="text-sm" htmlFor="goals">
          Goals <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="goals"
          name="goals"
          rows={3}
          maxLength={2000}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
          placeholder="More trial sign-ups from parents"
        />
        <Field label="Tone" name="tone" maxLength={200} placeholder="Warm, plain, no hype" />
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
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

function Field({
  label,
  name,
  required,
  maxLength,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  type?: string;
}) {
  return (
    <>
      <label className="text-sm" htmlFor={name}>
        {label} {!required && <span className="text-muted">(optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </>
  );
}
