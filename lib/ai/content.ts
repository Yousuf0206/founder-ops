import "server-only";

import { z } from "zod";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";
import { findForbiddenClaims } from "@/lib/prompts/assemble";

/**
 * The content bot (FR-C). Produces a structured draft and files it as
 * `awaiting_approval` — never approved, never published (FR-C-003,
 * Constitution I).
 */

const CONTENT_ROLE = `You are a content writer for an internal operations tool.
You draft social and marketing content that a human will review before anything is used.

You may only assert product facts that appear in the approved claims or knowledge base
above. If you need a fact you do not have, write "[unknown: <what you need>]" instead of
guessing.

Return ONLY valid JSON matching this shape:
{
  "hook": "opening line that earns attention",
  "script": "the main body, written for the platform",
  "captions": ["caption option 1", "caption option 2"],
  "titles": ["title option 1", "title option 2", "title option 3"],
  "hashtags": ["#example"],
  "cta": "one clear call to action",
  "visual_plan": "what should be on screen, shot by shot or frame by frame"
}`;

export const contentPayloadSchema = z.object({
  hook: z.string().default(""),
  script: z.string().default(""),
  captions: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  cta: z.string().default(""),
  visual_plan: z.string().default(""),
});

export type ContentPayload = z.infer<typeof contentPayloadSchema>;

export const contentRequestSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required.").max(300),
  platform: z.string().trim().min(1, "Platform is required.").max(60),
  audience: z.string().trim().max(300).default(""),
  tone: z.string().trim().max(120).default(""),
  length_hint: z.string().trim().max(120).default(""),
});

export type ContentRequest = z.infer<typeof contentRequestSchema>;

export class ForbiddenClaimError extends Error {
  constructor(readonly claims: string[]) {
    super(
      `The model produced forbidden claims (${claims.join(", ")}). The draft was discarded ` +
        `and the run logged. This is a defect — review the prompt or the claim wording.`,
    );
    this.name = "ForbiddenClaimError";
  }
}

export class UnparseableContentError extends Error {
  constructor() {
    super("The model returned output that could not be parsed as a content draft.");
    this.name = "UnparseableContentError";
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export async function runContent(
  session: OpsSession,
  input: ContentRequest,
): Promise<{ draftId: string }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const brief = [
    `Topic: ${input.topic}`,
    `Platform: ${input.platform}`,
    input.audience && `Audience: ${input.audience}`,
    input.tone && `Tone: ${input.tone}`,
    input.length_hint && `Length: ${input.length_hint}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { runId, claimSet, result } = await runGeneration({
    session,
    action: "content.run",
    role: CONTENT_ROLE,
    userPrompt: brief,
    jsonMode: true,
  });

  let payload: ContentPayload;
  try {
    payload = contentPayloadSchema.parse(JSON.parse(extractJson(result.text)));
  } catch {
    throw new UnparseableContentError();
  }

  // SC-005 / NFR-004: a forbidden claim in output is a defect. Catch it before
  // the draft can reach a reviewer, who might otherwise approve it.
  const violations = findForbiddenClaims(JSON.stringify(payload), claimSet);
  if (violations.length > 0) {
    await writeAudit(workspaceId, "content.forbidden_claim_blocked", "ai_run_log", runId, {
      claims: violations,
    });
    throw new ForbiddenClaimError(violations);
  }

  const { data: draft, error } = await supabase
    .from("content_drafts")
    .insert({
      workspace_id: workspaceId,
      topic: input.topic,
      platform: input.platform,
      audience: input.audience,
      tone: input.tone,
      length_hint: input.length_hint,
      payload_json: payload,
      status: "awaiting_approval",
      run_id: runId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  await writeAudit(workspaceId, "content.drafted", "content_draft", draft.id, {
    platform: input.platform,
  });

  return { draftId: draft.id };
}
