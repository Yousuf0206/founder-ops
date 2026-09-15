import { redirect } from "next/navigation";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/db/server";
import { requestOrigin } from "@/lib/http/origin";
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
 *
 * The server actions below must not close over anything from the component
 * body: captured values are serialized to the client, and functions cannot be.
 * `next` travels in a hidden field and helpers live at module scope.
 */

function loginUrl(next: string, mode: "signin" | "signup", error?: string): string {
  const params = new URLSearchParams({ next });
  if (mode === "signup") params.set("mode", "signup");
  if (error) params.set("error", error);
  return `/login?${params.toString()}`;
}

async function signIn(formData: FormData) {
  "use server";

  const next = safeNextPath(formData.get("next"));
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect(loginUrl(next, "signin", firstIssue(parsed.error)));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Do not reveal whether the email exists.
  if (error) redirect(loginUrl(next, "signin", "Incorrect email or password."));

  redirect(next);
}

async function createAccount(formData: FormData) {
  "use server";

  const next = safeNextPath(formData.get("next"));
  const parsed = createAccountSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect(loginUrl(next, "signup", firstIssue(parsed.error)));
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
      loginUrl(
        next,
        "signup",
        /already|registered|exists/i.test(createError.message)
          ? "An account already exists for this email. Sign in instead."
          : createError.message,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect(loginUrl(next, "signup", signInError.message));

  redirect(next);
}

/**
 * Google sign-in, for new and returning users alike. Supabase creates the
 * account on first use and links it to an existing account with the same
 * verified email. /auth/callback exchanges the returned code for a session;
 * users without a workspace then land on /onboarding.
 *
 * The redirect uses the host the user is on so the PKCE verifier cookie set
 * here is readable at the callback. Supabase only honors it if the URL is in
 * the project's Redirect URLs allow-list.
 */
async function signInWithGoogle(formData: FormData) {
  "use server";

  const next = safeNextPath(formData.get("next"));
  const mode = formData.get("mode") === "signup" ? "signup" : "signin";

  const supabase = await createSupabaseServerClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(loginUrl(next, mode, error?.message ?? "Google sign-in is unavailable. Try again."));
  }

  redirect(data.url);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const signingUp = params.mode === "signup";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">Lumo-Ops</h1>
      <p className="mt-1 text-sm text-muted">
        {signingUp ? "Create your account to get started." : "Sign in to your workspace."}
      </p>

      {params.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {params.error}
        </p>
      )}

      <form action={signInWithGoogle} className="mt-6">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={signingUp ? "signup" : "signin"} />
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-ground"
        >
          <GoogleIcon />
          {signingUp ? "Sign up with Google" : "Continue with Google"}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or use email
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={signingUp ? createAccount : signIn} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="text-sm" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
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
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        {signingUp ? (
          <p className="text-xs text-muted">At least 8 characters.</p>
        ) : (
          <a href="/forgot-password" className="self-end text-xs text-muted underline">
            Forgot password?
          </a>
        )}
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          {signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {signingUp ? "Already have an account? " : "New to Lumo-Ops? "}
        <a
          href={loginUrl(next, signingUp ? "signin" : "signup")}
          className="font-medium text-ink underline"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </a>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
