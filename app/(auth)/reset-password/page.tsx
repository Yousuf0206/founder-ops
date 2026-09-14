import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";
import { firstIssue, resetPasswordSchema } from "@/lib/validation/auth";

const EXPIRED = `/forgot-password?error=${encodeURIComponent(
  "That reset link has expired or was already used. Request a new one.",
)}`;

/**
 * Choose a new password. Reachable only with the recovery session that
 * /auth/callback creates from a reset link.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(EXPIRED);

  async function setNewPassword(formData: FormData) {
    "use server";

    const back = (message: string) => `/reset-password?error=${encodeURIComponent(message)}`;

    const parsed = resetPasswordSchema.safeParse({
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const server = await createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await server.auth.getUser();
    if (!caller) redirect(EXPIRED);

    const { error } = await server.auth.updateUser({ password: parsed.data.password });
    if (error) redirect(back(error.message));

    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-[--color-muted]">For {user.email}</p>

      {params.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {params.error}
        </p>
      )}

      <form action={setNewPassword} className="mt-6 flex flex-col gap-3">
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
          className="rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
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
          className="rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
        >
          Save password
        </button>
      </form>
    </div>
  );
}
