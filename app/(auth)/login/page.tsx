import { redirect } from "next/navigation";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/db/server";
import {
  createAccountSchema,
  firstIssue,
  safeNextPath,
  signInSchema,
} from "@/lib/validation/auth";

/**
 * Login and sign-up (T0.5). Email + password — no email round trip, so it works
 * the same on any device and does not depend on a link surviving a mail client.
 *
 * Sign-up is open to anyone. A new account has no workspace, so the ops layout
 * sends it to /onboarding to create one; invited users land back on their
 * /invite/<token> via `next` instead.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const signingUp = params.mode === "signup";

  const back = (message: string, mode = "") =>
    `/login?next=${encodeURIComponent(next)}${mode ? `&mode=${mode}` : ""}&error=${encodeURIComponent(message)}`;

  async function signIn(formData: FormData) {
    "use server";

    const parsed = signInSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error)));

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    // Do not reveal whether the email exists.
    if (error) redirect(back("Incorrect email or password."));

    redirect(next);
  }

  async function createAccount(formData: FormData) {
    "use server";

    const parsed = createAccountSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) redirect(back(firstIssue(parsed.error), "signup"));
    const { email, password } = parsed.data;

    // Created through the admin API with the email pre-confirmed, so sign-up
    // needs no confirmation link. Tradeoff: the address is not proven owned.
    const admin = createSupabaseAdminClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      redirect(
        back(
          /already|registered|exists/i.test(createError.message)
            ? "An account already exists for this email. Sign in instead."
            : createError.message,
          "signup",
        ),
      );
    }

    const supabase = await createSupabaseServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) redirect(back(signInError.message, "signup"));

    redirect(next);
  }

  const switchHref = (mode: string) =>
    `/login?next=${encodeURIComponent(next)}${mode ? `&mode=${mode}` : ""}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">Founder Ops</h1>
      <p className="mt-1 text-sm text-[--color-muted]">
        {signingUp ? "Create your account to get started." : "Sign in to your workspace."}
      </p>

      {params.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {params.error}
        </p>
      )}

      <form action={signingUp ? createAccount : signIn} className="mt-6 flex flex-col gap-3">
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
        <label className="text-sm" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={signingUp ? 8 : undefined}
          maxLength={72}
          autoComplete={signingUp ? "new-password" : "current-password"}
          className="rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
        {signingUp ? (
          <p className="text-xs text-[--color-muted]">At least 8 characters.</p>
        ) : (
          <a href="/forgot-password" className="self-end text-xs text-[--color-muted] underline">
            Forgot password?
          </a>
        )}
        <button
          type="submit"
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
        >
          {signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[--color-muted]">
        {signingUp ? "Already have an account? " : "New to Founder Ops? "}
        <a href={switchHref(signingUp ? "" : "signup")} className="font-medium text-[--color-ink] underline">
          {signingUp ? "Sign in" : "Create an account"}
        </a>
      </p>
    </div>
  );
}
