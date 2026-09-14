import Link from "next/link";

import { canWrite } from "@/lib/auth/session";
import { getClaimSet, requireSession } from "@/lib/knowledge/repo";
import { ClaimsForm } from "./claims-form";

export default async function ClaimsPage() {
  const session = await requireSession();
  const claimSet = await getClaimSet(session.activeWorkspace.workspaceId);
  const writer = canWrite(session.activeWorkspace.role);

  const approved = claimSet?.approved_claims ?? [];
  const forbidden = claimSet?.forbidden_claims ?? [];
  const brandVoice = claimSet?.brand_voice ?? "";

  return (
    <div className="max-w-2xl">
      <Link href="/knowledge" className="text-sm text-muted">
        ← Knowledge
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Claim set</h1>
      <p className="mt-1 text-sm text-muted">
        Binds every AI prompt in this workspace. Editing it changes what the bots may say from
        the next run onward — it does not revisit drafts already generated.
      </p>

      {writer ? (
        <ClaimsForm approved={approved} forbidden={forbidden} brandVoice={brandVoice} />
      ) : (
        <ReadOnlyClaims approved={approved} forbidden={forbidden} brandVoice={brandVoice} />
      )}
    </div>
  );
}

function ReadOnlyClaims({
  approved,
  forbidden,
  brandVoice,
}: {
  approved: string[];
  forbidden: string[];
  brandVoice: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <ClaimList title="Approved claims" claims={approved} />
      <ClaimList title="Forbidden claims" claims={forbidden} />
      <section>
        <h2 className="text-sm font-medium">Brand voice</h2>
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-sm">
          {brandVoice.trim() || <span className="text-muted">Not set</span>}
        </p>
      </section>
      <p className="text-xs text-muted">
        You have viewer access, so the claim set is read-only.
      </p>
    </div>
  );
}

function ClaimList({ title, claims }: { title: string; claims: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      {claims.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None defined.</p>
      ) : (
        <ul className="mt-2 list-inside list-disc rounded-lg border border-line bg-surface p-4 text-sm">
          {claims.map((claim) => (
            <li key={claim}>{claim}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
