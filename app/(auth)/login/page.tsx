import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Login (T0.5). Magic-link email sign-in — no password storage, and it doubles
 * as the path an invited user takes before redeeming their invitation.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;

  async function signIn(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim();
    const next = String(formData.get("next") ?? "/");

    if (!email || !email.includes("@")) {
      redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}`);
    }

    const supabase = await createSupabaseServerClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Team-only: signing in must not create accounts for strangers.
        // (Constitution V)
        shouldCreateUser: true,
      },
    });

    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    redirect("/login?sent=1");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold tracking-tight">Founder Ops</h1>
      <p className="mt-1 text-sm text-[--color-muted]">Internal tool. Team access only.</p>

      {params.sent ? (
        <div className="mt-8 rounded-lg border border-[--color-line] bg-[--color-surface] p-4 text-sm">
          Check your email for a sign-in link.
        </div>
      ) : (
        <form action={signIn} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label className="text-sm" htmlFor="email">
            Work email
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
            Send sign-in link
          </button>
        </form>
      )}

      {params.error && <p className="mt-4 text-sm text-red-600">{params.error}</p>}
    </div>
  );
}
