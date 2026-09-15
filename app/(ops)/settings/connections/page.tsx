import Link from "next/link";

import { isOwner } from "@/lib/auth/session";
import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { isLinkedInConfigured } from "@/lib/connectors/linkedin/oauth";
import { LIVE_PUBLISH_PLATFORMS } from "@/lib/connectors/registry";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/content/platforms";
import { disconnectAccountAction, setAccountAutoAction } from "./actions";

type AccountRow = {
  id: string;
  platform: string;
  display_name: string;
  scopes: string[];
  status: string;
  auto_enabled: boolean;
  expires_at: string | null;
  created_at: string;
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const owner = isOwner(session.activeWorkspace.role);
  const supabase = await createSupabaseServerClient();

  // Token columns are not readable by signed-in users at all; list columns explicitly.
  const { data } = await supabase
    .from("connected_accounts")
    .select("id, platform, display_name, scopes, status, auto_enabled, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const accounts = (data ?? []) as AccountRow[];
  const keyConfigured = Boolean(process.env.CONNECTOR_TOKEN_KEY);

  return (
    <div className="max-w-3xl">
      <Link href="/settings" className="text-sm text-muted">
        ← Settings
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Connected accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Publishing goes only to accounts connected here, through each platform&apos;s official
        sign-in. Tokens are encrypted and never shown.
      </p>

      {params.error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {params.error}
        </p>
      )}
      {params.connected && (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Connected {params.connected}.
        </p>
      )}

      {!keyConfigured && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          CONNECTOR_TOKEN_KEY is not set on the server, so no account can be connected.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Accounts</h2>
        {accounts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
            No accounts connected.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{account.display_name || account.platform}</span>
                  <span className="ml-2 text-xs text-muted">
                    {PLATFORM_LABELS[account.platform as keyof typeof PLATFORM_LABELS] ?? account.platform}
                    {account.status !== "active" && ` · ${account.status} — reconnect`}
                    {account.expires_at &&
                      account.status === "active" &&
                      ` · token expires ${new Date(account.expires_at).toLocaleDateString()}`}
                  </span>
                </span>
                {owner ? (
                  <span className="flex items-center gap-2">
                    {account.status === "active" && (
                      <form action={setAccountAutoAction}>
                        <input type="hidden" name="account_id" value={account.id} />
                        <input type="hidden" name="auto_enabled" value={account.auto_enabled ? "false" : "true"} />
                        <button type="submit" className="rounded-md border border-line px-2 py-1 text-xs">
                          {account.auto_enabled ? "Auto: on — turn off" : "Auto: off — turn on"}
                        </button>
                      </form>
                    )}
                    <form action={disconnectAccountAction}>
                      <input type="hidden" name="account_id" value={account.id} />
                      <button type="submit" className="rounded-md border border-line px-2 py-1 text-xs">
                        Disconnect
                      </button>
                    </form>
                  </span>
                ) : (
                  <span className="text-xs text-muted">auto {account.auto_enabled ? "on" : "off"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Connect</h2>
        {!owner ? (
          <p className="mt-2 text-sm text-muted">Only an owner can connect or disconnect accounts.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const live = (LIVE_PUBLISH_PLATFORMS as readonly string[]).includes(platform);
              const ready = live && keyConfigured && (platform !== "linkedin" || isLinkedInConfigured());
              return (
                <li key={platform} className="flex items-center justify-between gap-4 text-sm">
                  <span>{PLATFORM_LABELS[platform]}</span>
                  {ready ? (
                    // A plain anchor: this starts a redirect flow and must never be prefetched.
                    <a
                      href={`/api/ops/connections/${platform}`}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Connect
                    </a>
                  ) : (
                    <span className="text-xs text-muted">
                      {live ? "not configured on the server" : "drafts only for now"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
