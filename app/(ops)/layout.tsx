import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";

/**
 * The membership gate (T0.7).
 *
 * Two rejections, deliberately distinguished:
 *   - no session          → send to login
 *   - session, no membership → access denied, and no data is fetched
 *
 * This is the outer of two gates. RLS underneath is the one that actually
 * protects the rows; this exists so the UI fails clearly rather than showing
 * an empty shell. (Constitution V)
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/research", label: "Research" },
  { href: "/content", label: "Content" },
  { href: "/approvals", label: "Approvals" },
  { href: "/settings", label: "Settings" },
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

    return <AccessDenied email={user.email ?? ""} />;
  }

  const { activeWorkspace, email } = session;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between border-b border-[--color-line] py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">Founder Ops</span>
          <span className="text-sm text-[--color-muted]">{activeWorkspace.workspaceName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-[--color-muted]">
          <span>{email}</span>
          <span className="rounded-full border border-[--color-line] px-2 py-0.5 text-xs uppercase tracking-wide">
            {activeWorkspace.role}
          </span>
        </div>
      </header>

      <div className="flex flex-1 gap-8 py-6">
        <nav className="w-44 shrink-0">
          <ul className="flex flex-col gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-[--color-muted] hover:bg-[--color-surface] hover:text-[--color-ink]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1">{children}</main>
      </div>

      <footer className="border-t border-[--color-line] py-4 text-xs text-[--color-muted]">
        Drafts only. Nothing here publishes or contacts anyone automatically.
      </footer>
    </div>
  );
}

function AccessDenied({ email }: { email: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-lg font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-[--color-muted]">
        You are signed in as {email}, but you are not a member of any workspace.
      </p>
      <p className="mt-4 text-sm text-[--color-muted]">
        Ask a workspace owner to invite this address, then open the invitation link they send you.
      </p>
      <form action="/auth/sign-out" method="post" className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-[--color-line] px-3 py-2 text-sm hover:bg-[--color-surface]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
