import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { callerCanApprove, listApprovalsFor } from "@/lib/approvals/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CampaignPayload } from "@/lib/ai/campaign";
import { CampaignDecision } from "../campaign-forms";
import { StatusPill } from "../../status-pill";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (!campaign) notFound();

  const [approvals, mayApprove] = await Promise.all([
    listApprovalsFor(workspaceId, id),
    callerCanApprove(workspaceId),
  ]);

  const payload = campaign.payload_json as CampaignPayload;

  return (
    <div className="max-w-3xl">
      <Link href="/campaigns" className="text-sm text-[--color-muted]">
        ← Campaigns
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{campaign.goal}</h1>
          {campaign.audience && (
            <p className="mt-1 text-sm text-[--color-muted]">{campaign.audience}</p>
          )}
        </div>
        <StatusPill status={campaign.status} />
      </div>

      {payload.positioning_options.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Positioning options</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {payload.positioning_options.map((option, index) => (
              <li
                key={index}
                className="rounded-lg border border-[--color-line] bg-[--color-surface] p-3 text-sm"
              >
                <p className="font-medium">{option.angle}</p>
                {option.why_it_works && (
                  <p className="mt-1 text-[--color-muted]">{option.why_it_works}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {payload.posts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Posts</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {payload.posts.map((post, index) => (
              <li
                key={index}
                className="rounded-lg border border-[--color-line] bg-[--color-surface] p-3 text-sm"
              >
                <p className="text-xs text-[--color-muted]">{post.platform}</p>
                <p className="mt-1 font-medium">{post.hook}</p>
                <p className="mt-1 whitespace-pre-wrap">{post.body}</p>
                {post.cta && <p className="mt-1 text-[--color-muted]">CTA: {post.cta}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(payload.email_draft.subject || payload.email_draft.body) && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Email draft</h2>
          <div className="mt-2 rounded-lg border border-[--color-line] bg-[--color-surface] p-3 text-sm">
            <p className="font-medium">{payload.email_draft.subject}</p>
            <p className="mt-2 whitespace-pre-wrap">{payload.email_draft.body}</p>
          </div>
          {/* US6 scenario 3, said plainly where a reader would worry about it. */}
          <p className="mt-2 text-xs text-[--color-muted]">
            A draft for you to send yourself. Approving this campaign sends no email.
          </p>
        </section>
      )}

      {payload.experiment.hypothesis && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Experiment</h2>
          <dl className="mt-2 rounded-lg border border-[--color-line] bg-[--color-surface] p-3 text-sm">
            <dt className="text-xs text-[--color-muted]">Hypothesis</dt>
            <dd>{payload.experiment.hypothesis}</dd>
            {payload.experiment.measure && (
              <>
                <dt className="mt-2 text-xs text-[--color-muted]">Measure</dt>
                <dd>{payload.experiment.measure}</dd>
              </>
            )}
            {payload.experiment.duration && (
              <>
                <dt className="mt-2 text-xs text-[--color-muted]">Duration</dt>
                <dd>{payload.experiment.duration}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {mayApprove ? (
        <CampaignDecision campaignId={campaign.id} status={campaign.status} />
      ) : (
        <p className="mt-8 rounded-lg border border-[--color-line] bg-[--color-surface] p-4 text-sm text-[--color-muted]">
          You do not have approval rights in this workspace.
        </p>
      )}

      {approvals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Decision history</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {approvals.map((approval) => (
              <li
                key={approval.id}
                className="rounded-lg border border-[--color-line] bg-[--color-surface] p-3 text-sm"
              >
                <span className="font-medium">{approval.status.replace(/_/g, " ")}</span>
                <span className="text-[--color-muted]">
                  {" · "}
                  {new Date(approval.created_at).toLocaleString()}
                </span>
                {approval.notes && <p className="mt-1 text-[--color-muted]">{approval.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
