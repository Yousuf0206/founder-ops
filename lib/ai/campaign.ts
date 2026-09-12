import "server-only";

import { z } from "zod";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { runGeneration, writeAudit } from "@/lib/ai/run";
import { findForbiddenClaims } from "@/lib/prompts/assemble";
import { ForbiddenClaimError, UnparseableContentError } from "@/lib/ai/content";

/** The campaign bot (FR-M). Same claim binding, same approval gate as content. */

const CAMPAIGN_ROLE = `You are a growth strategist for an internal operations tool.
Given a goal and an audience, you produce a campaign plan a human will review.

The email draft you write is a DRAFT for a human to read. It will not be sent by this
system to anyone.

Only assert product facts from the approved claims or knowledge base above.

Return ONLY valid JSON matching this shape:
{
  "positioning_options": [ { "angle": "...", "why_it_works": "..." } ],
  "posts": [ { "platform": "...", "hook": "...", "body": "...", "cta": "..." } ],
  "email_draft": { "subject": "...", "body": "..." },
  "experiment": { "hypothesis": "...", "measure": "...", "duration": "..." }
}`;

export const campaignPayloadSchema = z.object({
  positioning_options: z
    .array(z.object({ angle: z.string(), why_it_works: z.string().default("") }))
    .default([]),
  posts: z
    .array(
      z.object({
        platform: z.string().default(""),
        hook: z.string().default(""),
        body: z.string().default(""),
        cta: z.string().default(""),
      }),
    )
    .default([]),
  email_draft: z
    .object({ subject: z.string().default(""), body: z.string().default("") })
    .default({ subject: "", body: "" }),
  experiment: z
    .object({
      hypothesis: z.string().default(""),
      measure: z.string().default(""),
      duration: z.string().default(""),
    })
    .default({ hypothesis: "", measure: "", duration: "" }),
});

export type CampaignPayload = z.infer<typeof campaignPayloadSchema>;

export const campaignRequestSchema = z.object({
  goal: z.string().trim().min(1, "Goal is required.").max(500),
  audience: z.string().trim().max(300).default(""),
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export async function runCampaign(
  session: OpsSession,
  input: CampaignRequest,
): Promise<{ campaignId: string }> {
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const { runId, claimSet, result } = await runGeneration({
    session,
    action: "campaign.run",
    role: CAMPAIGN_ROLE,
    userPrompt: [`Goal: ${input.goal}`, input.audience && `Audience: ${input.audience}`]
      .filter(Boolean)
      .join("\n"),
    jsonMode: true,
  });

  let payload: CampaignPayload;
  try {
    payload = campaignPayloadSchema.parse(JSON.parse(extractJson(result.text)));
  } catch {
    throw new UnparseableContentError();
  }

  const violations = findForbiddenClaims(JSON.stringify(payload), claimSet);
  if (violations.length > 0) {
    await writeAudit(workspaceId, "campaign.forbidden_claim_blocked", "ai_run_log", runId, {
      claims: violations,
    });
    throw new ForbiddenClaimError(violations);
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: workspaceId,
      goal: input.goal,
      audience: input.audience,
      payload_json: payload,
      status: "awaiting_approval",
      run_id: runId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  await writeAudit(workspaceId, "campaign.drafted", "campaign", campaign.id, {});

  return { campaignId: campaign.id };
}
