import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * The Growth Instant shell (T-A1, T-D4).
 *
 * The navigation contract from spec.md is implemented here and nowhere else:
 *
 *   Auth ......................... pre-app gate, not a destination
 *   Start · Hurdles · Pack · Publish · Next ... the five primary destinations
 *   Generate pack ................ an action on Hurdles, not a screen
 *   Settings / Advanced .......... NOT main nav
 *
 * Adding a sixth entry to NAV breaks SC-06. That is a spec violation, not a
 * layout preference — see FR-GI-A-006.
 *
 * Unlike the (ops) shell, a signed-in user with no membership is NOT sent to
 * /onboarding: UX Principle 4 forbids a setup form before a first result, and
 * the workspace is created silently when they submit a URL (FR-GI-S-003).
 */

const NAV = [
  { href: "/start", label: "Start" },
  { href: "/hurdles", label: "Hurdles" },
  { href: "/pack", label: "Pack" },
  { href: "/publish", label: "Publish" },
  { href: "/next", label: "Next" },
] as const;

export default async function GrowthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The pre-app gate. Sign-in precedes Start (spec Decision 1).
  if (!user) redirect("/login?next=/start");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <Link href="/start" className="text-sm font-semibold tracking-tight">
          Lumo Grow
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted hover:text-fg">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 py-8">{children}</main>

      <footer className="border-t border-line py-4 text-xs text-muted">
        {/* Advanced is reachable, but never from the primary nav (FR-GI-A-006). */}
        <Link href="/advanced" className="hover:text-fg">
          Advanced
        </Link>
      </footer>
    </div>
  );
}
