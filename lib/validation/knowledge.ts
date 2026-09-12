import { z } from "zod";

/**
 * Boundary validation for the knowledge base (T1.6).
 *
 * Project rule: validate input at system boundaries. These schemas are the
 * single definition of what a valid doc or claim set is — the API routes and
 * the UI server actions both parse through them, so neither can drift.
 */

const trimmed = (min: number, max: number) =>
  z.string().transform((s) => s.trim()).pipe(z.string().min(min).max(max));

export const knowledgeDocCreateSchema = z.object({
  title: trimmed(1, 200),
  body: z.string().max(100_000).default(""),
  category: trimmed(1, 60).default("general"),
  last_verified_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export const knowledgeDocUpdateSchema = knowledgeDocCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

/**
 * Claims are stored as arrays of short phrases, not prose.
 *
 * The forbidden list is checked against generated output (SC-005), so each
 * entry has to be a matchable phrase. Blank entries are dropped rather than
 * rejected, because the editor submits one textarea line per claim and a
 * trailing newline is not a user error.
 */
const claimList = z
  .array(z.string())
  .max(200)
  .transform((claims) =>
    claims.map((claim) => claim.trim()).filter((claim) => claim.length > 0),
  )
  .pipe(z.array(z.string().min(1).max(500)));

export const claimSetUpdateSchema = z.object({
  approved_claims: claimList.default([]),
  forbidden_claims: claimList.default([]),
  brand_voice: z.string().max(5_000).default(""),
});

export type KnowledgeDocCreate = z.infer<typeof knowledgeDocCreateSchema>;
export type KnowledgeDocUpdate = z.infer<typeof knowledgeDocUpdateSchema>;
export type ClaimSetUpdate = z.infer<typeof claimSetUpdateSchema>;

/** Splits a textarea into one claim per non-empty line. */
export function linesToClaims(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Flattens a ZodError into a single readable sentence for the UI. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
