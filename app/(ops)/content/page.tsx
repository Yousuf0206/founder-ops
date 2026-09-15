import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { listDrafts } from "@/lib/approvals/repo";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { platformLabel } from "@/lib/content/platforms";
import { createSupabaseServerClient } from "@/lib/db/server";
import { ContentForm } from "./content-form";
import { StatusPill } from "../status-pill";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>;
}) {
  const { idea: ideaId } = await searchParams;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, drafts, ideaResult] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    listDrafts(workspaceId),
    // US8 AC4: a selected idea is the topic source. Scoped to this workspace.
    ideaId && /^[0-9a-f-]{36}$/i.test(ideaId)
      ? supabase
          .from("strategy_ideas")
          .select("id, title")
          .eq("workspace_id", workspaceId)
          .eq("id", ideaId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const idea = (ideaResult.data as { id: string; title: string } | null) ?? undefined;
  const writer = canWrite(session.activeWorkspace.role);

  let disabled: string | undefined;
  if (!writer) disabled = "You have viewer access, so you cannot draft content.";
  else if (!claimSet || !hasApprovedClaims(claimSet))
    disabled =
      "Generation is refused until this workspace has at least one approved claim. Add claims under Knowledge.";
  else if (!isProviderConfigured())
    disabled = "No AI provider is configured on the server.";
  else if (cap.used >= cap.cap)
    disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}). Runs resume at UTC midnight.`;

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Content</h1>
          <p className="mt-1 text-sm text-muted">
            Draft native assets for every platform from the workspace claim set. Every draft waits
            for a human.
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted">
          {cap.used} / {cap.cap} runs today
        </p>
      </div>

      <ContentForm disabled={disabled} idea={idea} />

      <h2 className="mt-10 text-sm font-medium">Drafts</h2>
      {drafts.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          No drafts yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Link
                href={`/content/${draft.id}`}
                className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-ground"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{draft.topic}</span>
                  <span className="text-xs text-muted">{platformLabel(draft.platform)}</span>
                </span>
                <StatusPill status={draft.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
