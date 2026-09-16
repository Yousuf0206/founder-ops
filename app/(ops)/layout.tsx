import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { switchWorkspaceAction } from "./workspace-actions";

/**
 * The membership gate (T0.7).
 *
 * Two cases, deliberately distinguished:
 *   - no session             → send to login
 *   - session, no membership → send to /onboarding to create a workspace;
 *                              no workspace data is fetched
 *
 * This is the outer of two gates. RLS underneath is the one that actually
 * protects the rows; this exists so the UI routes clearly rather than showing
 * an empty shell. (Constitution VII)
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/analyze", label: "Analyze" },
  { href: "/research", label: "Research" },
  { href: "/strategy", label: "Strategy" },
  { href: "/content", label: "Content" },
  { href: "/approvals", label: "Approvals" },
  { href: "/publish", label: "Publish" },
  { href: "/insights", label: "Insights" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/leads", label: "Leads" },
  { href: "/audit", label: "Audit" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
] as const;

export default async function OpsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOpsSession();

  if (!session) {
    const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!supabaseConfigured) redirect("/login");

    const { createSupabaseServerClient } = await import("@/lib/db/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    // Signed in but no workspace yet: a new sign-up. Let them create one.
    redirect("/onboarding");
  }

  const { activeWorkspace, email, memberships } = session;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between border-b border-line py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">Lumo Grow</span>
          <span className="text-sm text-muted">{activeWorkspace.workspaceName}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted">
          {memberships.length > 1 && (
            <form action={switchWorkspaceAction} className="flex items-center gap-2">
              <label htmlFor="workspace_id" className="sr-only">
                Workspace
              </label>
              <select
                id="workspace_id"
                name="workspace_id"
                defaultValue={activeWorkspace.workspaceId}
                className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
              >
                {memberships.map((m) => (
                  <option key={m.workspaceId} value={m.workspaceId}>
                    {m.workspaceName}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-xs underline">
                Switch
              </button>
            </form>
          )}
          <Link href="/onboarding" className="hover:text-ink">
            + New workspace
          </Link>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide">
            {activeWorkspace.role}
          </span>
          <Link href="/account" className="hover:text-ink">
            {email}
          </Link>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 gap-8 py-6">
        <nav className="w-44 shrink-0">
          <ul className="flex flex-col gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-muted hover:bg-surface hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1">{children}</main>
      </div>

      <footer className="border-t border-line py-4 text-xs text-muted">
        Publishes only to accounts this workspace connected, under its publish mode, after the
        claim check and daily cap. Leads are never contacted automatically.
      </footer>
    </div>
  );
}
