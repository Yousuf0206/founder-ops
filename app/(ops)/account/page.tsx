import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";
import { requireSession } from "@/lib/knowledge/repo";
import { changePasswordSchema, firstIssue } from "@/lib/validation/auth";

/** Account settings for the signed-in user (not the workspace). */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();

  async function changePassword(formData: FormData) {
    "use server";

    const back = (message: string) => `/account?error=${encodeURIComponent(message)}`;

    const parsed = changePasswordSchema.safeParse({
      current: formData.get("current"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const me = await requireSession();
    const supabase = await createSupabaseServerClient();

    // Re-check the current password so an unattended session cannot lock the owner out.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: me.email,
      password: parsed.data.current,
    });
    if (verifyError) redirect(back("Your current password is incorrect."));

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) redirect(back(error.message));

    redirect("/account?done=1");
  }

  const input =
    "rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm";

  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-[--color-muted]">Signed in as {session.email}</p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Change password</h2>

        {params.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {params.error}
          </p>
        )}
        {params.done && <p className="mt-3 text-sm text-green-700">Password updated.</p>}

        <form action={changePassword} className="mt-3 flex flex-col gap-3">
          <label className="text-sm" htmlFor="current">
            Current password
          </label>
          <input
            id="current"
            name="current"
            type="password"
            required
            maxLength={72}
            autoComplete="current-password"
            className={input}
          />
          <label className="text-sm" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            className={input}
          />
          <label className="text-sm" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            className={input}
          />
          <button
            type="submit"
            className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
          >
            Update password
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Your workspaces</h2>
        <ul className="mt-3 divide-y divide-[--color-line] rounded-lg border border-[--color-line] bg-[--color-surface] text-sm">
          {session.memberships.map((m) => (
            <li key={m.workspaceId} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{m.workspaceName}</span>
              <span className="text-xs uppercase tracking-wide text-[--color-muted]">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
