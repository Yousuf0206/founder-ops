import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { capStatus } from "@/lib/ai/run";
import { isProviderConfigured } from "@/lib/ai/provider";
import { createSupabaseServerClient } from "@/lib/db/server";
import { CampaignForm } from "./campaign-forms";
import { StatusPill } from "../status-pill";

export default async function CampaignsPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, { data: campaigns }] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    supabase
      .from("campaigns")
      .select("id, goal, status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);

  let disabled: string | undefined;
  if (!canWrite(session.activeWorkspace.role))
    disabled = "You have viewer access, so you cannot draft campaigns.";
  else if (!claimSet)
    disabled = "This workspace has no claim set. Define claims under Knowledge first.";
  else if (!isProviderConfigured())
    disabled = "No AI provider is configured on the server.";
  else if (cap.used >= cap.cap)
    disabled = `Daily AI run cap reached (${cap.used} of ${cap.cap}).`;

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            Turn a goal into positioning, posts, an email draft, and an experiment.
          </p>
        </div>
        <p className="shrink-0 text-xs text-[--color-muted]">
          {cap.used} / {cap.cap} runs today
        </p>
      </div>

      <CampaignForm disabled={disabled} />

      <h2 className="mt-10 text-sm font-medium">Campaigns</h2>
      {(campaigns ?? []).length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[--color-line] p-6 text-sm text-[--color-muted]">
          No campaigns yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[--color-line] rounded-lg border border-[--color-line] bg-[--color-surface]">
          {(campaigns ?? []).map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/campaigns/${campaign.id}`}
                className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-[--color-ground]"
              >
                <span className="min-w-0 truncate text-sm font-medium">{campaign.goal}</span>
                <StatusPill status={campaign.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
