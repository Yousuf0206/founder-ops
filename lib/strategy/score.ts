import { z } from "zod";

/**
 * Strategy idea scoring (002 T1.6, FR-S-001..003).
 *
 * Pure so it can be tested without a model. The rule that matters most is
 * evidence: an idea survives only if at least one of its evidence quotes
 * actually appears in the source it names. A model citing evidence it invented
 * is the failure this exists to stop.
 */

export const EVIDENCE_SOURCES = ["research", "analysis"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

const score = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((n) => Math.round(n));

export const evidenceSchema = z.object({
  source: z.enum(EVIDENCE_SOURCES),
  ref: z.string().trim().min(1).max(300),
  quote: z.string().trim().min(1).max(1000),
});

export const ideaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  angle: z.string().trim().max(1000).default(""),
  impact: score,
  effort: score,
  confidence: score,
  evidence: z.array(evidenceSchema).default([]),
});

export const strategyOutputSchema = z.object({ ideas: z.array(ideaSchema).default([]) });

export type Evidence = z.infer<typeof evidenceSchema>;
export type Idea = z.infer<typeof ideaSchema>;

/** Every string inside a stored report, so quotes are matched against content, not JSON escaping. */
export function flattenText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(flattenText).join("\n");
  return "";
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Source text keyed by source; a source that was not supplied cannot be cited. */
export type EvidenceTexts = Partial<Record<EvidenceSource, string>>;

export function verifiedEvidence(idea: Idea, sources: EvidenceTexts): Evidence[] {
  return idea.evidence.filter((evidence) => {
    const text = sources[evidence.source];
    return text !== undefined && normalize(text).includes(normalize(evidence.quote));
  });
}

/** FR-S-003: ideas with no verifiable evidence are dropped, not saved. */
export function keepEvidenced(ideas: Idea[], sources: EvidenceTexts): Idea[] {
  return ideas
    .map((idea) => ({ ...idea, evidence: verifiedEvidence(idea, sources) }))
    .filter((idea) => idea.evidence.length > 0);
}

/**
 * One number to sort by: impact weighted by confidence, discounted by effort
 * (maximum effort halves the score rather than zeroing it). 0–100.
 */
export function priorityScore(idea: { impact: number; effort: number; confidence: number }): number {
  return Math.round(idea.impact * (idea.confidence / 100) * (1 - idea.effort / 200));
}

export function rankIdeas<T extends { impact: number; effort: number; confidence: number }>(
  ideas: T[],
): T[] {
  return [...ideas].sort((a, b) => priorityScore(b) - priorityScore(a));
}
