import type { ClaimSet } from "@/lib/knowledge/repo";

/**
 * Prompt assembly (T2.3). The single choke point through which every
 * generation prompt in this product is built.
 *
 * Constitution III — approved and forbidden claims bind every AI prompt in the
 * workspace — is enforced here by construction: `assembleSystemPrompt` takes
 * the claim set as a REQUIRED argument and throws when it is absent. There is
 * no code path that reaches a provider with an unbound prompt, because there is
 * no way to build one.
 */

export class MissingClaimSetError extends Error {
  constructor() {
    super(
      "This workspace has no claim set. Generation is refused until approved and " +
        "forbidden claims are defined at /knowledge/claims.",
    );
    this.name = "MissingClaimSetError";
  }
}

/**
 * Decisions §7: an empty approved-claims list refuses generation. A subclass of
 * MissingClaimSetError, so every caller that already maps "claims not ready" to
 * a refusal handles this case the same way.
 */
export class EmptyApprovedClaimsError extends MissingClaimSetError {
  constructor() {
    super();
    this.message =
      "This workspace has no approved claims. Generation is refused until at least one " +
      "approved claim is added at /knowledge/claims.";
    this.name = "EmptyApprovedClaimsError";
  }
}

export function hasApprovedClaims(claimSet: ClaimSet): boolean {
  return claimSet.approved_claims.some((claim) => claim.trim().length > 0);
}

export const UNKNOWN_INSTRUCTION =
  "If unknown, say unknown; never invent product facts.";

export type KnowledgeContext = {
  claimSet: ClaimSet | null;
  docs?: { title: string; category: string; body: string }[];
};

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Builds the system prompt shared by every bot.
 *
 * @throws MissingClaimSetError when the workspace has no claim set.
 */
export function assembleSystemPrompt(
  role: string,
  context: KnowledgeContext,
): string {
  const { claimSet, docs = [] } = context;

  // The guard that makes Constitution III structural rather than procedural.
  if (!claimSet) throw new MissingClaimSetError();
  if (!hasApprovedClaims(claimSet)) throw new EmptyApprovedClaimsError();

  const sections: string[] = [role.trim()];

  sections.push(
    [
      "## Brand voice",
      claimSet.brand_voice.trim() ||
        "(No brand voice defined. Write plainly and avoid superlatives.)",
    ].join("\n"),
  );

  sections.push(
    [
      "## Approved claims",
      "These are the only product claims you may assert. Do not extrapolate beyond them.",
      claimSet.approved_claims.length > 0
        ? bulletList(claimSet.approved_claims)
        : "(None defined. You may not assert ANY product fact. Say unknown instead.)",
    ].join("\n"),
  );

  sections.push(
    [
      "## Forbidden claims",
      "Never state, imply, paraphrase, or hint at any of the following:",
      claimSet.forbidden_claims.length > 0
        ? bulletList(claimSet.forbidden_claims)
        : "(None defined.)",
    ].join("\n"),
  );

  if (docs.length > 0) {
    sections.push(
      [
        "## Knowledge base",
        "Background for this workspace. Facts here may be used; anything absent is unknown.",
        docs
          .map((doc) => `### ${doc.title} (${doc.category})\n${doc.body}`.trim())
          .join("\n\n"),
      ].join("\n"),
    );
  }

  sections.push(["## Standing rules", `- ${UNKNOWN_INSTRUCTION}`].join("\n"));

  return sections.join("\n\n");
}

/**
 * Post-generation check for SC-005 / NFR-004: a forbidden claim appearing in
 * approved output is a defect.
 *
 * This is a safety net, not the primary control — the prompt is. It catches
 * literal reproductions, not paraphrases, which is why the prompt instruction
 * above forbids implying and paraphrasing too.
 */
export function findForbiddenClaims(output: string, claimSet: ClaimSet): string[] {
  const haystack = output.toLowerCase();
  return claimSet.forbidden_claims.filter((claim) => {
    const needle = claim.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}
