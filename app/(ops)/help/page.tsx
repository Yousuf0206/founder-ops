import Link from "next/link";

import { callerCanApprove } from "@/lib/approvals/repo";
import { capStatus } from "@/lib/ai/run";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";

/**
 * Help (T5.6). The team manual, in the app rather than in a document nobody
 * opens — so the answer to "why did generation refuse?" sits one click from
 * where it refused.
 *
 * Read-only, and mostly static. The few live figures it does read — the claim
 * set, the day's cap, the caller's own rights — are the ones a reader would
 * otherwise have to go and check elsewhere to make sense of the text.
 */

export default async function HelpPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const { role, workspaceName } = session.activeWorkspace;

  const [claimSet, cap, mayApprove] = await Promise.all([
    getClaimSet(workspaceId),
    capStatus(workspaceId),
    callerCanApprove(workspaceId),
  ]);

  const approvedCount = claimSet?.approved_claims.length ?? 0;
  const forbiddenCount = claimSet?.forbidden_claims.length ?? 0;
  const generationReady = approvedCount > 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Help</h1>
      <p className="mt-1 text-sm text-muted">
        Bots write; people decide. Nothing here posts to a platform, emails a customer, or
        contacts anyone on its own.
      </p>

      {/* --- where this workspace actually stands --------------------------- */}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Your workspace right now</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Workspace">{workspaceName}</Row>
          <Row label="Your role">
            {role}
            <span className="ml-2 text-xs text-muted">
              {role === "viewer"
                ? "read-only"
                : mayApprove
                  ? "may run bots and decide on approvals"
                  : "may run bots; cannot decide on approvals"}
            </span>
          </Row>
          <Row label="Claim set">
            {generationReady ? (
              <span>
                {approvedCount} approved · {forbiddenCount} forbidden
              </span>
            ) : (
              <span className="text-red-600">
                No approved claims — generation will refuse.{" "}
                <Link href="/knowledge/claims" className="underline">
                  Add them
                </Link>
              </span>
            )}
          </Row>
          <Row label="AI runs today">
            {cap.used} of {cap.cap} used
            {cap.cap > 0 && cap.used >= cap.cap && (
              <span className="ml-2 text-xs text-red-600">
                cap reached — resets at midnight UTC
              </span>
            )}
          </Row>
        </dl>
      </section>

      {/* --- the daily loop -------------------------------------------------- */}

      <section className="mt-10">
        <h2 className="text-sm font-medium">How the work moves</h2>
        <ol className="mt-3 flex flex-col gap-3 text-sm">
          <Step n={1} title="Knowledge, first and always">
            <Link href="/knowledge" className="underline">
              Knowledge
            </Link>{" "}
            holds your product truth: documents, plus the claim set — approved claims,
            forbidden claims, brand voice. Every prompt this app sends is built from it.
            With no approved claims the bots decline, rather than invent product facts.
            Setting up a new workspace? The repository&apos;s{" "}
            <code className="text-xs">docs/workspace-starter.md</code> is a worked example
            of all four, ready to copy in.
          </Step>
          <Step n={2} title="Research turns notes into ranked opportunities">
            Paste customer feedback or competitor notes into{" "}
            <Link href="/research" className="underline">
              Research
            </Link>
            . Every claim-bearing line comes back labelled Fact, Inference, or Hypothesis.
            Act on facts, test hypotheses, and never let an inference reach a caption as a
            fact.
          </Step>
          <Step n={3} title="Content drafts a whole package">
            <Link href="/content" className="underline">
              Content
            </Link>{" "}
            takes a topic and platform — plus audience, tone, and length, which are what
            make a draft usable — and returns hook, script, captions, titles, hashtags,
            CTA, and a visual plan. It is saved as{" "}
            <code className="text-xs">awaiting_approval</code>.
          </Step>
          <Step n={4} title="A person decides">
            <Link href="/approvals" className="underline">
              Approvals
            </Link>{" "}
            holds content and campaigns in one queue. Approve, edit and approve, or reject
            with notes. Both the model&apos;s original and your edits stay in the record.
          </Step>
          <Step n={5} title="You publish, then mark it published">
            Copy the approved draft out and post it yourself. Coming back to mark it{" "}
            <code className="text-xs">published</code> changes a label and nothing else; it
            keeps the queue honest about what actually shipped.
          </Step>
        </ol>
      </section>

      {/* --- what each screen is for ----------------------------------------- */}

      <section className="mt-10">
        <h2 className="text-sm font-medium">What each screen is for</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Knowledge">
            Product truth and the claim set. Documents carry a last-verified date — re-save
            one when you have checked it is still true.
          </Row>
          <Row label="Research">
            Pasted notes in, ranked and labelled opportunities out. Saved here, sent
            nowhere.
          </Row>
          <Row label="Content">A post package for one topic and platform.</Row>
          <Row label="Approvals">
            The one queue. Pending at the top, decided below as a record.
          </Row>
          <Row label="Campaigns">
            A goal and audience become positioning options, posts, an email draft, and an
            experiment idea — reviewed in the same queue. Approving sends no email.
          </Row>
          <Row label="Leads">
            Inbound contacts from your site form, classified and scored 0-100. Read them and
            move the stage as you work them.
          </Row>
          <Row label="Audit">
            Every AI run and every approval decision, with actor and token cost.
          </Row>
          <Row label="Settings">
            Daily AI cap, team notification address, invitations, approval rights, and the
            lead-ingest secret.
          </Row>
        </dl>
      </section>

      {/* --- roles ------------------------------------------------------------ */}

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
              <Perm can="Edit knowledge and claims" owner editor />
              <Perm can="Run research, content, campaigns" owner editor />
              <Perm can="Decide on approvals" owner editorNote="if granted" />
              <Perm can="Invite people, change roles" owner />
              <Perm can="Change the daily AI cap" owner />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">
          An owner invites by email in Settings, and grants an editor approval rights there
          too. An invitation link works only for the address it was sent to.
        </p>
      </section>

      {/* --- troubleshooting --------------------------------------------------- */}

      <section className="mt-10">
        <h2 className="text-sm font-medium">When something stops</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Generation refuses">
            The workspace has no approved claims. Fill them in under Knowledge. This is
            intended: a bot that declines is recoverable, one that invents is not.
          </Row>
          <Row label="Cap reached">
            {cap.cap} AI runs per day, counted per workspace, reset at midnight UTC. No
            provider call is made once it is hit, so a runaway loop costs nothing. An owner
            can raise it in Settings.
          </Row>
          <Row label="Buttons are missing">
            You are a viewer, or an editor without approval rights. An owner grants them in
            Settings.
          </Row>
          <Row label="A run failed">
            The provider timed out or returned unusable output. Nothing partial was saved —
            you will not find a broken stub in the queue. Run it again.
          </Row>
          <Row label="The data looks wrong">
            Check the workspace name in the header. Every queue, count, and budget belongs
            to that one workspace, and nothing crosses over.
          </Row>
          <Row label="Leads stopped arriving">
            The ingest secret was rotated, or the workspace slug header is wrong. A bad slug
            and a bad secret return the same rejection, by design.
          </Row>
        </dl>
      </section>

      <p className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Four things this app will not do: publish anything, contact a lead, write without a
        claim set, or read another workspace&apos;s rows.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted sm:w-36 sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
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
