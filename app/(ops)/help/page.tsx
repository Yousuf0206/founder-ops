import Link from "next/link";

import { callerCanApprove } from "@/lib/approvals/repo";
import { capStatus } from "@/lib/ai/run";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { hasApprovedClaims } from "@/lib/prompts/assemble";
import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Help — the team manual, in the app, one click from where something refused.
 * 002 Phase 3 DoD: the three publish modes are documented here.
 *
 * Mostly static. The live figures it reads — claims, caps, mode, the caller's
 * rights — are the ones a reader would otherwise go and check elsewhere.
 */

export default async function HelpPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const { role, workspaceName } = session.activeWorkspace;
  const supabase = await createSupabaseServerClient();

  const [claimSet, cap, mayApprove, { data: workspace }, { data: publishedToday }] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    callerCanApprove(workspaceId),
    supabase.from("workspaces").select("plan, publish_mode, daily_publish_cap").eq("id", workspaceId).maybeSingle(),
    supabase.rpc("publishes_used_today", { target_workspace: workspaceId }),
  ]);

  const approvedCount = claimSet?.approved_claims.filter((c) => c.trim()).length ?? 0;
  const forbiddenCount = claimSet?.forbidden_claims.length ?? 0;
  const generationReady = Boolean(claimSet && hasApprovedClaims(claimSet));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Help</h1>
      <p className="mt-1 text-sm text-muted">
        Agents draft from your product truth. Posts go out only to accounts you connected, under the
        mode an owner chose, after the claim check and the daily cap. Leads are never contacted.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Your workspace right now</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Workspace">
            {workspaceName} <span className="ml-2 text-xs text-muted">{workspace?.plan} plan</span>
          </Row>
          <Row label="Your role">
            {role}
            <span className="ml-2 text-xs text-muted">
              {role === "viewer"
                ? "read-only"
                : mayApprove
                  ? "may run agents, approve, and publish"
                  : "may run agents; cannot approve or publish"}
            </span>
          </Row>
          <Row label="Claim set">
            {generationReady ? (
              <span>
                {approvedCount} approved · {forbiddenCount} forbidden
              </span>
            ) : (
              <span className="text-red-600">
                No approved claims — generation and publishing will refuse.{" "}
                <Link href="/knowledge/claims" className="underline">
                  Add them
                </Link>
              </span>
            )}
          </Row>
          <Row label="Publish mode">{workspace?.publish_mode?.replace(/_/g, " ")}</Row>
          <Row label="Today">
            {cap.used} of {cap.cap} AI runs · {(publishedToday as number | null) ?? 0} of{" "}
            {workspace?.daily_publish_cap ?? 0} publishes (UTC day)
          </Row>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">The three publish modes</h2>
        <p className="mt-1 text-sm text-muted">
          Every workspace runs in exactly one mode. Only an owner can change it, under{" "}
          <Link href="/settings/modes" className="underline">
            Settings → Publishing controls
          </Link>
          .
        </p>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Draft only">
            Nothing publishes. Approved drafts are copied out and posted by hand.
          </Row>
          <Row label="Approve, then publish">
            The default. Someone with approval rights approves a draft, then publishes it now or
            schedules it, to a connected account.
          </Row>
          <Row label="Auto within rules">
            Team and business plans only. A draft publishes without a person when every rule
            passes: the master switch is on, the account is switched to auto, it is inside the
            workspace&apos;s time window and days, and — if set — its idea meets the minimum
            confidence. A draft with a forbidden claim is sent to a person instead. Each auto post
            is recorded as approved by the rule.
          </Row>
        </dl>
        <p className="mt-3 text-sm text-muted">
          In every mode, the final text is checked against forbidden claims and the daily publish
          cap is reserved immediately before the platform call. No mode skips either.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">How the work moves</h2>
        <ol className="mt-3 flex flex-col gap-3 text-sm">
          <Step n={1} title="Knowledge, first and always">
            <Link href="/knowledge" className="underline">
              Knowledge
            </Link>{" "}
            holds documents and the claim set — approved claims, forbidden claims, brand voice.
            Every prompt is built from it. With no approved claims, nothing generates or publishes.
          </Step>
          <Step n={2} title="Analyze and research">
            <Link href="/analyze" className="underline">
              Analyze
            </Link>{" "}
            reads one public page (never one robots.txt disallows).{" "}
            <Link href="/research" className="underline">
              Research
            </Link>{" "}
            turns pasted notes into ranked opportunities. Both label every claim Fact, Inference,
            or Hypothesis.
          </Step>
          <Step n={3} title="Strategy scores ideas">
            <Link href="/strategy" className="underline">
              Strategy
            </Link>{" "}
            scores campaign ideas 0–100 on impact, effort, and confidence. An idea is kept only if
            its evidence quote is really in the source.
          </Step>
          <Step n={4} title="Content drafts every platform">
            <Link href="/content" className="underline">
              Content
            </Link>{" "}
            writes a native draft for each platform you pick — Instagram, Facebook, LinkedIn,
            TikTok, X, YouTube. Platforms without a publish connector stay drafts to copy out.
          </Step>
          <Step n={5} title="A person approves">
            <Link href="/approvals" className="underline">
              Approvals
            </Link>
            : approve, edit and approve, or reject. The model&apos;s original and your edit are both
            kept, and the claim check runs on your edited text.
          </Step>
          <Step n={6} title="Publish and learn">
            Publish or schedule from the draft&apos;s page; follow every post on{" "}
            <Link href="/publish" className="underline">
              Publish
            </Link>
            . On{" "}
            <Link href="/insights" className="underline">
              Insights
            </Link>
            , summarise what worked and review proposed claim changes — nothing changes until you
            accept.
          </Step>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Who can do what</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Can</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Editor</th>
                <th className="py-2 font-medium">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Perm can="Read everything in the workspace" owner editor viewer />
              <Perm can="Edit knowledge; run agents" owner editor />
              <Perm can="Approve, publish, schedule, retry" owner editorNote="if granted" />
              <Perm can="Accept knowledge proposals" owner editor />
              <Perm can="Connect accounts; change mode, caps, auto rules" owner />
              <Perm can="Invite, remove, grant approval rights" owner />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">When something stops</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Generation refuses">
            No approved claims. Add at least one under Knowledge. A bot that declines is
            recoverable; one that invents is not.
          </Row>
          <Row label="A post is blocked">
            The daily publish cap was reached, the account was disconnected, the mode changed to
            draft only, or a forbidden claim was added since approval. The reason is on the job.
            Fix it, then retry — a retry never counts against the cap twice.
          </Row>
          <Row label="A post failed">
            The platform refused it or the token expired (reconnect the account). If the job says
            the outcome is unknown, check the account before retrying: the post may already be live.
          </Row>
          <Row label="A scheduled post has not gone out">
            Scheduled jobs run on the server&apos;s schedule. Someone with approval rights can use
            &ldquo;Run due jobs now&rdquo; on the Publish page.
          </Row>
          <Row label="Buttons are missing">
            You are a viewer, or an editor without approval rights. An owner grants them in Settings.
          </Row>
          <Row label="Leads stopped arriving">
            The ingest secret was rotated, or the workspace slug header is wrong. Both return the
            same rejection, by design.
          </Row>
        </dl>
      </section>

      <p className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Things this app will not do: publish to an account you did not connect, publish without a
        mode, skip the claim check or the cap, contact a lead, or read another workspace&apos;s rows.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted sm:w-36 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs text-accent">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted">{children}</p>
      </div>
    </li>
  );
}

function Perm({
  can,
  owner = false,
  editor = false,
  viewer = false,
  editorNote,
}: {
  can: string;
  owner?: boolean;
  editor?: boolean;
  viewer?: boolean;
  editorNote?: string;
}) {
  const mark = (allowed: boolean, note?: string) =>
    note ? (
      <span className="text-xs text-muted">{note}</span>
    ) : allowed ? (
      <span className="text-accent">yes</span>
    ) : (
      <span className="text-muted">&mdash;</span>
    );

  return (
    <tr>
      <td className="py-2.5 pr-4">{can}</td>
      <td className="py-2.5 pr-4">{mark(owner)}</td>
      <td className="py-2.5 pr-4">{mark(editor, editorNote)}</td>
      <td className="py-2.5">{mark(viewer)}</td>
    </tr>
  );
}
