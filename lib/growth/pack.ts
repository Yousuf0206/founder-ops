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

/**
 * Why a pack could not be read. The sentence the founder sees is the same in
 * every case — they can do exactly one thing about it — but the reason is what
 * makes the next failure diagnosable instead of a shrug (005 D-1).
 *
 *   invalid_json   the response was not JSON at all, or was cut off mid-object
 *   truncated      the provider stopped at its output ceiling, so JSON ended early
 *   no_angles      JSON parsed, no angle survived validation
 *   too_few_posts  JSON parsed, fewer than MIN_PACK_POSTS usable posts
 */
export type PackFailureReason = "invalid_json" | "truncated" | "no_angles" | "too_few_posts";

export class UnparseablePackError extends Error {
  constructor(
    readonly reason: PackFailureReason = "invalid_json",
    /** Counts only — never model text, which may carry the user's own content. */
    readonly counts: { angles?: number; posts?: number; dropped?: number } = {},
  ) {
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
 * Reads a pack out of model output, keeping what is usable (005 D-1).
 *
 * The strict version of this was `growthPackSchema.parse(...)` in a try/catch:
 * one malformed post, a ninth post past the maximum, or a platform the model
 * spelled "Linkedin" discarded the whole pack and charged the founder a cap
 * slot for nothing. That is what failed on production on 2026-11-15 and
 * succeeded on an identical retry seconds later — the model is non-deterministic
 * at the edges of a shape, and an all-or-nothing reader turns a wobble into a
 * dead end on someone's first run.
 *
 * So the lists are read element by element. A bad post is dropped, a surplus
 * post is trimmed, and the pack fails only when what survives is genuinely not a
 * pack: no angle at all, or fewer than the five posts the product promises. The
 * floors still mean something — they are simply applied to what arrived rather
 * than used as a reason to throw it all away.
 *
 * `truncated` comes from the provider's own finish reason. A pack cut off at
 * the output ceiling is a different fact from a model that answered in prose,
 * and only the first is fixed by asking for fewer posts.
 */
export function parsePackOutput(
  text: string,
  options: { truncated?: boolean } = {},
): { pack: GrowthPackOutput; dropped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    throw new UnparseablePackError(options.truncated ? "truncated" : "invalid_json");
  }

  const root = (raw ?? {}) as { angles?: unknown; posts?: unknown };

  const angles: PackAngle[] = (Array.isArray(root.angles) ? root.angles : []).flatMap((item) => {
    const result = packAngleSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });

  const candidates = Array.isArray(root.posts) ? root.posts : [];
  const posts: PackPost[] = [];
  let dropped = 0;
  for (const item of candidates) {
    const result = packPostSchema.safeParse(normalizePostInput(item));
    if (result.success) posts.push(normalizePost(result.data));
    else dropped += 1;
  }

  if (angles.length === 0) {
    throw new UnparseablePackError(options.truncated ? "truncated" : "no_angles", {
      posts: posts.length,
      dropped,
    });
  }
  if (posts.length < MIN_PACK_POSTS) {
    throw new UnparseablePackError(options.truncated ? "truncated" : "too_few_posts", {
      angles: angles.length,
      posts: posts.length,
      dropped,
    });
  }

  return {
    // Surplus is trimmed rather than refused: a ninth good post is not a reason
    // to show a founder none.
    pack: { angles: angles.slice(0, 4), posts: posts.slice(0, MAX_PACK_POSTS) },
    dropped,
  };
}

/** Forgives the spellings a model reaches for before the schema sees them. */
function normalizePostInput(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const post = item as Record<string, unknown>;
  if (typeof post.platform !== "string") return item;
  return { ...post, platform: post.platform.trim().toLowerCase() };
}

/**
 * The hashtag de-duplication (005 D-4).
 *
 * Models routinely end the body with the same hashtag line they also return in
 * `hashtags`, so a copied post pasted them twice — in the product's own output,
 * which is the one thing a founder takes away from here. The trailing
 * hashtag-only line is removed from the body and its tags folded into the list,
 * so nothing is lost and nothing is said twice.
 */
export function normalizePost(post: PackPost): PackPost {
  const lines = post.script.split("\n");
  const tags = [...post.hashtags];

  while (lines.length > 0) {
    const last = (lines[lines.length - 1] ?? "").trim();
    if (last === "") {
      lines.pop();
      continue;
    }
    const words = last.split(/\s+/);
    if (!words.every((word) => /^#[^\s#]+$/.test(word))) break;
    for (const word of words) {
      if (!tags.some((tag) => tag.toLowerCase() === word.toLowerCase())) tags.push(word);
    }
    lines.pop();
  }

  // Duplicates inside the list itself, case-insensitively, keeping first use.
  const seen = new Set<string>();
  const hashtags = tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ...post, script: lines.join("\n").trimEnd(), hashtags };
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
    const parsed = parsePackOutput(result.text, { truncated: result.truncated });
    pack = parsed.pack;
    if (parsed.dropped > 0) {
      // Not a failure, but not nothing either: a model dropping posts every run
      // is a prompt problem that would otherwise be invisible.
      console.warn(
        `growth.pack: dropped ${parsed.dropped} malformed post(s), kept ${pack.posts.length}`,
      );
    }
  } catch (error) {
    if (error instanceof UnparseablePackError) {
      console.error(
        `growth.pack unreadable (${error.reason})`,
        JSON.stringify({ ...error.counts, truncated: result.truncated, model: result.model }),
      );
    }
    throw error;
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
