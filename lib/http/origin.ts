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
