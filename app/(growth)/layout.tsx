import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * The Growth Instant shell (T-A1, T-D4).
 *
 * The navigation contract is implemented here and nowhere else. 6.0.0-subtraction
 * cut it from five entries to two (constitution R2, SC-04):
 *
 *   Auth .................. pre-app gate, not a destination
 *   Start · Results ....... the only two primary destinations
 *   Write my posts ........ an action on Results, not a screen
 *   Publish / Next ........ reachable, never primary (R7: Copy is the win)
 *   Advanced .............. buried in the footer, never co-equal
 *
 * A third entry in NAV breaks SC-04. Hurdles and Pack were two of the five, and
 * they are now the two in-page tabs of Results — the work is one thing, so it is
 * one screen. Publish stayed a route because an existing user mid-approval must
 * not lose it, but it is no longer somewhere a first run is pushed towards, and
 * nothing on the simple path requires it.
 *
 * Unlike the (ops) shell, a signed-in user with no membership is NOT sent to
 * /onboarding: UX Principle 4 forbids a setup form before a first result, and
 * the workspace is created silently when they submit a URL (FR-GI-S-003).
 */

const NAV = [
  { href: "/start", label: "Start" },
  { href: "/results", label: "Results" },
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
            /*
             * prefetch={false} is load-bearing (005 D-2). With prefetching on,
             * Next fetches /results when Start renders — before the analysis the
             * founder is about to run exists — and the redirect that follows the
             * run can be served from that cached payload, showing the PREVIOUS
             * run's problems under the URL just submitted. There are two screens
             * here and they are one click apart; prefetching buys almost nothing
             * and costs correctness at the exact moment the user is looking.
             */
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="text-muted hover:text-fg"
            >
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
