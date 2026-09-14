import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";
import { requestOrigin } from "@/lib/http/origin";
import { firstIssue, forgotPasswordSchema } from "@/lib/validation/auth";

/**
 * Forgot password: emails a reset link. The link lands on /auth/callback,
 * which signs the user in with a recovery session and forwards to
 * /reset-password to choose a new password.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  async function sendResetLink(formData: FormData) {
    "use server";

    const back = (message: string) =>
      `/forgot-password?error=${encodeURIComponent(message)}`;

    const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const supabase = await createSupabaseServerClient();
    const origin = await requestOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });

    // Supabase answers the same whether or not the account exists, so showing
    // its errors does not reveal which emails are registered.
    if (error) {
      redirect(
        back(
          error.status === 429
            ? "Too many reset requests. Wait a few minutes and try again."
            : error.message,
        ),
      );
    }

    redirect("/forgot-password?sent=1");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>

      {params.sent ? (
        <div className="mt-6 rounded-lg border border-[--color-line] bg-[--color-surface] p-4 text-sm">
          If an account exists for that email, a reset link is on its way. You can open it
          on any device. It expires in one hour.
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-[--color-muted]">
            Enter your account email and we&apos;ll send you a link to set a new password.
          </p>

          {params.error && (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {params.error}
            </p>
          )}

          <form action={sendResetLink} className="mt-6 flex flex-col gap-3">
            <label className="text-sm" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
            >
              Send reset link
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-[--color-muted]">
        <Link href="/login" className="font-medium text-[--color-ink] underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
