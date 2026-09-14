import "server-only";

import { headers } from "next/headers";

/**
 * The origin the current request was made to, e.g. "https://app.example.com".
 *
 * Taken from the request rather than only NEXT_PUBLIC_SITE_URL so links are
 * right on every deployment (production, previews, localhost) without per-env
 * configuration. Auth redirects built from it are still checked against the
 * Supabase Redirect URLs allow-list, so a spoofed Host cannot redirect users.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (host) {
    const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * The origin to put in links that are EMAILED, e.g. password reset.
 *
 * Never taken from request headers: a forged Host header would otherwise make
 * us email a victim a reset link pointing at an attacker's site, leaking the
 * token ("password reset poisoning"). In production this is the configured
 * NEXT_PUBLIC_SITE_URL, or Vercel's production domain if that is unset or
 * still points at localhost.
 */
export async function trustedSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const isLocal = (url: string) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

  if (process.env.NODE_ENV === "production") {
    if (configured && !isLocal(configured)) return configured;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
  }

  return configured ?? "http://localhost:3000";
}
