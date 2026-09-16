/**
 * Global forbidden patterns (T-A8, FR-GI-X-003).
 *
 * `findForbiddenClaims` in lib/prompts/assemble.ts enforces the claims a
 * WORKSPACE has forbidden. It takes a ClaimSet, so it cannot run on a first-run
 * workspace — which has no claim set at all (FR-GI-S-003 creates workspaces
 * silently). This module is the floor underneath it: patterns that are forbidden
 * for every workspace, always, whether or not anyone has configured anything.
 *
 * Constitution §5 and v3.0.0 UX Principle 6 — safety defaults are silent, not
 * setup homework. A user who never opens Advanced still gets these.
 *
 * Scope is deliberately narrow: guaranteed outcomes, invented rank, and false
 * certification, per Constitution §5 and FR-GI-X-003. This is a literal-text
 * safety net, not a content classifier — the prompt remains the primary control.
 */

export type ForbiddenPattern = {
  /** Stable id, used in audit entries and tests. */
  id: string;
  /** What the pattern protects against, in words a user would understand. */
  label: string;
  pattern: RegExp;
};

/**
 * Case-insensitive, and anchored so a pattern cannot fire inside a longer
 * token: `\b` on the word-initial alternatives, and an explicit `(?!\d)` on the
 * numeric ones, which keeps "no. 1" and "#1" out of "no. 10" and "#10".
 *
 * `\b` cannot do that job for "#1": `#` is not a word character, so a leading
 * `\b` after a space never matches, and the alternative was unreachable. It is
 * boundary-free and relies on the lookahead instead.
 */
export const GLOBAL_FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    id: "guaranteed-outcome",
    label: "Guaranteed results",
    pattern:
      /\b(guarantee[ds]?|guaranteed\s+results?|promise[ds]?\s+(?:results?|revenue|growth|roi))\b/i,
  },
  {
    id: "invented-rank",
    label: "Unverifiable rank claim",
    pattern:
      /(?:#\s*1(?!\d)|\b(?:no\.?\s*1(?!\d)|number\s+one|world'?s\s+(?:best|leading)|industry[- ]leading|the\s+(?:best|top)\s+(?:platform|tool|app|solution))\b)/i,
  },
  {
    id: "false-certification",
    label: "Unverified certification or endorsement",
    pattern:
      /\b(?:certified|accredited|officially\s+(?:approved|endorsed|recognised|recognized)|award[- ]winning|patented)\b/i,
  },
  {
    id: "risk-free",
    label: "Risk-free / no-risk promise",
    pattern: /\b(?:risk[- ]free|100%\s+(?:safe|secure|guaranteed)|zero\s+risk)\b/i,
  },
];

export type ForbiddenPatternHit = {
  id: string;
  label: string;
  /** The exact text that matched, for the audit trail and the UI. */
  match: string;
};

/**
 * Finds global forbidden patterns in generated output.
 *
 * Runs with no claim set and no workspace configuration — that is the whole
 * point. Workspace-specific forbidden claims are checked separately by
 * `findForbiddenClaims`; both run, and neither replaces the other.
 */
export function findGlobalForbidden(output: string): ForbiddenPatternHit[] {
  if (!output) return [];

  const hits: ForbiddenPatternHit[] = [];
  for (const { id, label, pattern } of GLOBAL_FORBIDDEN_PATTERNS) {
    const found = output.match(pattern);
    if (found) hits.push({ id, label, match: found[0] });
  }
  return hits;
}

/**
 * The block injected into every system prompt, including for workspaces with no
 * claim set. Stated as prose rather than regex: the prompt is the primary
 * control, and a model reads intent better than it reads a pattern list.
 */
export const GLOBAL_FORBIDDEN_PROMPT_BLOCK = [
  "## Always forbidden",
  "These are forbidden for every workspace, regardless of configuration.",
  "Never state, imply, paraphrase, or hint at any of the following:",
  "- Guaranteed results, guaranteed revenue, or promised outcomes of any kind.",
  "- Rank or superiority claims that the source page does not state: \"#1\", \"number one\", \"world's best\", \"industry-leading\".",
  "- Certifications, accreditations, awards, patents, or endorsements not evidenced on the source page.",
  "- \"Risk-free\", \"100% safe\", or equivalent absolute-safety language.",
].join("\n");
