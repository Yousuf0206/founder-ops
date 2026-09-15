import { z } from "zod";

/**
 * Learn-report validation (002 T4.4–T4.5, FR-LRN-003). Pure, so it is testable
 * without a model. Every finding, topic, and proposal must cite at least one of
 * the published posts it was given; citations to anything else are dropped.
 */

const cited = { evidence_job_ids: z.array(z.string()).default([]) };

export const learnOutputSchema = z.object({
  what_worked: z.array(z.object({ finding: z.string().trim().min(1).max(1000), ...cited })).default([]),
  suggested_topics: z
    .array(z.object({ topic: z.string().trim().min(1).max(300), why: z.string().trim().max(1000).default(""), ...cited }))
    .default([]),
  knowledge_proposals: z
    .array(
      z.object({
        kind: z.enum(["approved_claim_add", "forbidden_claim_add"]),
        text: z.string().trim().min(1).max(500),
        rationale: z.string().trim().max(1000).default(""),
        ...cited,
      }),
    )
    .default([]),
});

export type LearnOutput = z.infer<typeof learnOutputSchema>;

/** Keeps only citations to known posts, then drops items left with none. */
export function keepCited<T extends { evidence_job_ids: string[] }>(items: T[], knownJobIds: Set<string>): T[] {
  return items
    .map((item) => ({ ...item, evidence_job_ids: [...new Set(item.evidence_job_ids)].filter((id) => knownJobIds.has(id)) }))
    .filter((item) => item.evidence_job_ids.length > 0);
}

export function validateLearnOutput(output: LearnOutput, knownJobIds: Set<string>): LearnOutput {
  return {
    what_worked: keepCited(output.what_worked, knownJobIds),
    suggested_topics: keepCited(output.suggested_topics, knownJobIds),
    knowledge_proposals: keepCited(output.knowledge_proposals, knownJobIds),
  };
}
