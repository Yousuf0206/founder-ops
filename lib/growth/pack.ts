import "server-only";

import { z } from "zod";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";
import { AuthError } from "@/lib/knowledge/repo";
import { findForbiddenViolations } from "@/lib/prompts/assemble";
import { hasLiveConnector } from "@/lib/connectors/registry";
import { PLATFORM_NORMS, type SocialPlatform } from "@/lib/content/platforms";
import { hurdleSchema, type GrowthGoal, type Hurdle } from "@/lib/growth/analyze";

/**
 * Phase B — the Growth pack (work order P2).
 *
 * One click on Hurdles turns the hurdles into angles, and the angles into
 * posts. Like the analysis, it is ONE model call: angles that disagreed with
 * the posts written from them would be worse than useless, and a second call
 * would double the latency for no gain.
 *
 * The posts are `content_drafts` rows, not a new kind of object. That is the
 * whole design: approval, the forbidden-claim check at publish time, the daily
 * publish cap, the publish job and its receipt already exist for content_drafts
 * and are already tested. A parallel "pack post" table would have needed its own
 * copy of every one of those guardrails, and the copies would have drifted.
 */

/**
 * The platforms a pack writes for.
 *
 * LinkedIn is the one platform that can publish today (lib/connectors/registry).
 * Instagram is here as DRAFT ONLY, deliberately: a founder wants the caption to
 * exist so they can post it by hand, and writing it costs nothing extra inside
 * a call already being made. It cannot reach a publish job — `hasLiveConnector`
 * is the single gate for that, so an Instagram post is not publishable and
 * never touches the publish cap, and it becomes publishable the day Meta joins
 * that list and not a moment before.
 */
export const PACK_PLATFORMS = ["linkedin", "instagram"] as const satisfies readonly SocialPlatform[];

/** At least five posts in a pack; more is fine, endless is not. */
export const MIN_PACK_POSTS = 5;
const MAX_PACK_POSTS = 8;

const PACK_ROLE = `You are a growth content strategist. You are given a product's own facts and a ranked list of the growth hurdles standing between it and its market.

Produce a growth pack in two parts.

1. angles — 2 to 4 distinct strategic angles. An angle is a line of argument the product can make repeatedly, tied to a hurdle it addresses. Give each one:
   - angle: the line of argument, in one sentence.
   - hurdle: which hurdle it addresses, quoting the hurdle's title.
   - rationale: why this angle answers that hurdle.

2. posts — between 5 and 8 posts, each written from one of your angles. Give each one:
   - platform: exactly "linkedin" or "instagram".
   - angle: the angle it comes from, quoted exactly from your angles list.
   - topic: a short label for the post, under 120 characters.
   - hook: the opening line.
   - script: the post body, native to its platform.
   - cta: one clear call to action.
   - hashtags: 0 to 5 hashtags.

Write every post to be posted as it stands. No placeholders, no brackets for the founder to fill in, no notes to yourself.

You may only assert product facts supported by the product facts and approved claims above. If you need a fact you do not have, write "[unknown: <what you need>]" rather than guessing — a post that admits a gap is fixable, one that invents is not.

Never state or imply guaranteed results, rank claims ("#1", "world's best"), certifications, awards, or "risk-free".

Return ONLY valid JSON matching this shape:
{
  "angles": [{ "angle": "...", "hurdle": "...", "rationale": "..." }],
  "posts": [
    {
      "platform": "linkedin",
      "angle": "...",
      "topic": "...",
      "hook": "...",
      "script": "...",
      "cta": "...",
      "hashtags": ["#example"]
    }
  ]
}`;

export const packAngleSchema = z.object({
  angle: z.string().min(1),
  hurdle: z.string().default(""),
  rationale: z.string().default(""),
});

export const packPostSchema = z.object({
  platform: z.enum(PACK_PLATFORMS),
  angle: z.string().default(""),
  topic: z.string().min(1).max(300),
  hook: z.string().default(""),
  script: z.string().default(""),
  cta: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
});

export const growthPackSchema = z.object({
  angles: z.array(packAngleSchema).min(1).max(4),
  posts: z.array(packPostSchema).min(MIN_PACK_POSTS).max(MAX_PACK_POSTS),
});

export type PackAngle = z.infer<typeof packAngleSchema>;
export type PackPost = z.infer<typeof packPostSchema>;
export type GrowthPackOutput = z.infer<typeof growthPackSchema>;

/** Thrown when there is no successful analysis to build a pack from. */
export class NoAnalysisError extends Error {
  constructor() {
    super("Analyse your product URL first — a pack is written from your hurdles.");
    this.name = "NoAnalysisError";
  }
}

export class UnparseablePackError extends Error {
  constructor() {
    super("The pack came back unreadable. The failed run was logged — try again.");
    this.name = "UnparseablePackError";
  }
}

export class PackForbiddenContentError extends Error {
  constructor(readonly violations: string[]) {
    super("The pack came back with content we can't publish. The run was logged — try again.");
    this.name = "PackForbiddenContentError";
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/**
 * True when a pack post may ever reach a publish job.
 *
 * One expression, one source of truth, used by both the writer and the screen —
 * so "Instagram is draft-only" cannot be true in the UI and false in the data.
 */
export function isPublishablePlatform(platform: string): boolean {
  return hasLiveConnector(platform);
}

/** Renders a post into the `payload_json` shape content_drafts already stores. */
export function toDraftPayload(post: PackPost): Record<string, unknown> {
  return {
    hook: post.hook,
    script: post.script,
    captions: [],
    titles: [],
    hashtags: post.hashtags,
    cta: post.cta,
    visual_plan: "",
    // Kept so the Pack screen can group posts under the angle that produced
    // them without re-deriving the grouping from prose.
    angle: post.angle,
  };
}

type AnalysisRow = {
  id: string;
  source_url: string;
  hurdles: unknown;
  goal: GrowthGoal | null;
  goal_note: string | null;
};

function parseHurdles(raw: unknown): Hurdle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const result = hurdleSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

/**
 * Generates and persists a pack for the workspace's most recent successful
 * analysis, or for `analyzeRunId` when one is named.
 */
export async function runGrowthPack(
  session: OpsSession,
  input: { analyzeRunId?: string } = {},
): Promise<{ packId: string; draftIds: string[] }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const query = supabase
    .from("analyze_runs")
    .select("id, source_url, hurdles, goal, goal_note")
    .eq("workspace_id", workspaceId)
    .eq("status", "succeeded");

  const { data, error } = input.analyzeRunId
    ? await query.eq("id", input.analyzeRunId).maybeSingle()
    : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) throw error;
  if (!data) {
    if (input.analyzeRunId) {
      throw new AuthError("That analysis was not found in this workspace.", 404);
    }
    throw new NoAnalysisError();
  }

  const analysis = data as AnalysisRow;
  const hurdles = parseHurdles(analysis.hurdles);
  if (hurdles.length === 0) throw new NoAnalysisError();

  const brief = [
    `Product page: ${analysis.source_url}`,
    analysis.goal ? `The founder's stated goal is: ${analysis.goal}.` : "",
    // The locked rule: goal "other" is free text that must reach the prompt,
    // not a field that is stored and then quietly ignored.
    analysis.goal_note?.trim() ? `In their own words: ${analysis.goal_note.trim()}` : "",
    "",
    "Their growth hurdles, most important first:",
    ...hurdles.map(
      (hurdle, index) =>
        `${index + 1}. ${hurdle.title}` +
        (hurdle.why_it_hurts ? `\n   Why it hurts: ${hurdle.why_it_hurts}` : "") +
        (hurdle.suggested_fix ? `\n   Suggested fix: ${hurdle.suggested_fix}` : ""),
    ),
    "",
    "Platforms and their briefs:",
    ...PACK_PLATFORMS.map((platform) => `- ${platform}: ${PLATFORM_NORMS[platform]}`),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const { runId, claimSet, result } = await runGeneration({
    session,
    action: "growth.pack",
    role: PACK_ROLE,
    userPrompt: brief,
    jsonMode: true,
  });

  let pack: GrowthPackOutput;
  try {
    pack = growthPackSchema.parse(JSON.parse(extractJson(result.text)));
  } catch {
    throw new UnparseablePackError();
  }

  // The same net the ops content bot uses: the workspace's forbidden claims AND
  // the global patterns. One violation discards the whole pack rather than
  // shipping a set with a quiet defect in it — these are posts meant to go out
  // as they stand.
  const violations = findForbiddenViolations(JSON.stringify(pack), claimSet);
  if (violations.length > 0) {
    await writeAudit(workspaceId, "growth.pack_forbidden_blocked", "ai_run_log", runId, {
      claims: violations,
    });
    throw new PackForbiddenContentError(violations);
  }

  const { data: packRow, error: packError } = await supabase
    .from("growth_packs")
    .insert({
      workspace_id: workspaceId,
      analyze_run_id: analysis.id,
      angles: pack.angles,
      run_id: runId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (packError) throw packError;

  // `status` is left to the column default (awaiting_approval), which a database
  // trigger enforces anyway: nothing may insert a draft already approved.
  const { data: drafts, error: draftError } = await supabase
    .from("content_drafts")
    .insert(
      pack.posts.map((post) => ({
        workspace_id: workspaceId,
        topic: post.topic.slice(0, 300),
        platform: post.platform,
        audience: "",
        tone: "",
        payload_json: toDraftPayload(post),
        source: "growth_pack",
        growth_pack_id: packRow.id,
        run_id: runId,
        created_by: session.userId,
      })),
    )
    .select("id");

  if (draftError) throw draftError;

  await writeAudit(workspaceId, "growth.pack_generated", "growth_pack", packRow.id, {
    analyze_run_id: analysis.id,
    angles: pack.angles.length,
    posts: pack.posts.length,
    platforms: [...new Set(pack.posts.map((post) => post.platform))],
  });

  return {
    packId: packRow.id as string,
    draftIds: (drafts ?? []).map((row) => row.id as string),
  };
}
