import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/db/server";

const NEXT_COOKIE = "lumo-ops-auth-next";

/** Only ever redirect to a path on this origin. */
function safePath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/**
 * Completes an email sign-in, then continues.
 *
 * Supabase can land here in three shapes depending on the project's email
 * template and flow: `?code=` (PKCE), `?token_hash=&type=` (the newer default
 * template), or `?error=&error_description=` when the link expired or was
 * already consumed — often by a mail scanner opening it first.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const cookieStore = await cookies();

  // token_hash links cannot carry a query param, so fall back to what the login
  // form stashed. Consumed either way, so it cannot leak into a later sign-in.
  // A password-recovery link always continues to the new-password form.
  const next =
    searchParams.get("type") === "recovery"
      ? "/reset-password"
      : safePath(searchParams.get("next") ?? cookieStore.get(NEXT_COOKIE)?.value ?? null);
  cookieStore.delete(NEXT_COOKIE);

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  // Supabase reports its own failures as query params, not as a missing code.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return fail(providerError);

  const supabase = await createSupabaseServerClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  return fail(
    "That sign-in link did not carry a code. Open the most recent link in the same browser you requested it from, and check that NEXT_PUBLIC_SITE_URL matches the host you are browsing.",
  );
}
