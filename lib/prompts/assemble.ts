import type { ClaimSet } from "@/lib/knowledge/repo";
import type { ProductFacts } from "@/lib/facts/repo";
import {
  findGlobalForbidden,
  GLOBAL_FORBIDDEN_PROMPT_BLOCK,
} from "@/lib/claims/forbidden-patterns";

/**
 * Prompt assembly (T2.3). The single choke point through which every
 * generation prompt in this product is built.
 *
 * Constitution III — approved and forbidden claims bind every AI prompt in the
 * workspace — is enforced here by construction: `assembleSystemPrompt` refuses
 * to build a prompt that is not bound to a source of product truth. There is no
 * code path that reaches a provider with an unbound prompt, because there is no
 * way to build one.
 *
 * v3.0.0 (T-A7) widened what counts as binding, without weakening the rule.
 * Constitution I's first-run carve-out lets AUTO-EXTRACTED PRODUCT FACTS bind a
 * prompt when no approved claim exists yet — a first run has a silently created
 * workspace (FR-GI-S-003) and therefore no claim set at all. So the guard is now:
 *
 *   approved claims OR product facts — at least one, always.
 *
 * What did NOT change: forbidden claims still bind, the global forbidden block
 * is now injected on EVERY prompt including claim-less ones, and a workspace
 * with neither claims nor facts is still refused.
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

/**
 * FR-GI-X-004: extraction seeds the knowledge base, so non-empty product facts
 * are a binding source of product truth in their own right.
 *
 * "Non-empty" means the model actually learned something about the product. A
 * row of empty strings — extraction ran and found nothing — does NOT bind, and
 * must refuse like an empty claim set rather than licence a free-form prompt.
 */
export function hasProductFacts(facts: ProductFacts | null | undefined): boolean {
  if (!facts) return false;
  return (
    facts.product_name.trim().length > 0 ||
    facts.tagline.trim().length > 0 ||
    facts.features.length > 0
  );
}

export const UNKNOWN_INSTRUCTION =
  "If unknown, say unknown; never invent product facts.";

export type KnowledgeContext = {
  claimSet: ClaimSet | null;
  docs?: { title: string; category: string; body: string }[];
  /**
   * Auto-extracted product facts (FR-GI-X-002). Binds the prompt when no
   * approved claim exists yet; always injected when present.
   */
  productFacts?: ProductFacts | null;
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
  const { claimSet, docs = [], productFacts = null } = context;

  // The guard that makes Constitution III structural rather than procedural.
  // v3.0.0: product facts are an accepted binding source (Constitution I
  // carve-out), so the refusal fires only when BOTH sources are empty.
  const boundByFacts = hasProductFacts(productFacts);
  if (!claimSet) {
    if (!boundByFacts) throw new MissingClaimSetError();
  } else if (!hasApprovedClaims(claimSet) && !boundByFacts) {
    throw new EmptyApprovedClaimsError();
  }

  const sections: string[] = [role.trim()];

  sections.push(
    [
      "## Brand voice",
      claimSet?.brand_voice.trim() ||
        "(No brand voice defined. Write plainly and avoid superlatives.)",
    ].join("\n"),
  );

  sections.push(
    [
      "## Approved claims",
      "These are the only product claims you may assert. Do not extrapolate beyond them.",
      claimSet && claimSet.approved_claims.length > 0
        ? bulletList(claimSet.approved_claims)
        : boundByFacts
          ? "(None approved yet. Assert only what the product facts below support.)"
          : "(None defined. You may not assert ANY product fact. Say unknown instead.)",
    ].join("\n"),
  );

  // FR-GI-X-002/004: on a first run this is the ONLY source of product truth,
  // so it carries its own provenance and its own unknowns.
  if (productFacts && boundByFacts) {
    const facts: string[] = [
      "## Product facts (auto-extracted)",
      productFacts.confirmed_at
        ? "Extracted from the product's own public page and confirmed by a human."
        : "Extracted from the product's own public page and NOT yet confirmed by a human. " +
          "Treat them as what the page says, not as verified truth, and do not extrapolate.",
    ];
    if (productFacts.product_name.trim()) facts.push(`- Product: ${productFacts.product_name}`);
    if (productFacts.tagline.trim()) facts.push(`- Tagline: ${productFacts.tagline}`);
    if (productFacts.features.length > 0) {
      facts.push(
        "- Features stated on the page:",
        ...productFacts.features.map(
          (item) => `  - ${item.feature}${item.evidence ? ` ("${item.evidence}")` : ""}`,
        ),
      );
    }
    if (productFacts.primary_cta.trim()) facts.push(`- Primary CTA: ${productFacts.primary_cta}`);
    if (productFacts.pricing_signals.length > 0) {
      facts.push("- Pricing signals:", ...productFacts.pricing_signals.map((s) => `  - ${s}`));
    }
    if (productFacts.unknowns.length > 0) {
      facts.push(
        "- Not stated on the page — these are UNKNOWN and may not be asserted:",
        ...productFacts.unknowns.map((item) => `  - ${item}`),
      );
    }
    sections.push(facts.join("\n"));
  }

  sections.push(
    [
      "## Forbidden claims",
      "Never state, imply, paraphrase, or hint at any of the following:",
      claimSet && claimSet.forbidden_claims.length > 0
        ? bulletList(claimSet.forbidden_claims)
        : "(None defined for this workspace.)",
    ].join("\n"),
  );

  // FR-GI-X-003: the floor. Injected on every prompt, including workspaces with
  // no claim set — safety defaults are silent, not setup homework.
  sections.push(GLOBAL_FORBIDDEN_PROMPT_BLOCK);

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
export function findForbiddenClaims(output: string, claimSet: ClaimSet | null): string[] {
  if (!claimSet) return [];

  const haystack = output.toLowerCase();
  return claimSet.forbidden_claims.filter((claim) => {
    const needle = claim.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * The post-generation net every caller should use (T-A7/T-A8).
 *
 * `findForbiddenClaims` alone returns nothing for a workspace with no claim
 * set — which, after v3.0.0, is exactly the workspace a first run generates in.
 * That would have left first-run output with NO post-generation check at all.
 * This combines both layers: the workspace's own forbidden claims, and the
 * global patterns that apply to every workspace regardless of configuration.
 *
 * Returns human-readable strings because callers put them straight into an
 * audit entry and a blocked-generation error.
 */
export function findForbiddenViolations(
  output: string,
  claimSet: ClaimSet | null,
): string[] {
  return [
    ...findForbiddenClaims(output, claimSet),
    ...findGlobalForbidden(output).map((hit) => `${hit.label}: "${hit.match}"`),
  ];
}
