import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/db/server";
import { assembleSystemPrompt, hasApprovedClaims } from "@/lib/prompts/assemble";
import { generate, isProviderConfigured } from "@/lib/ai/provider";
import { notifyTeamMember, isEmailConfigured } from "@/lib/email/notify";

/**
 * Inbound lead ingest and classification (FR-L).
 *
 * This is the one route reached without a user session, so it authenticates
 * with a per-workspace shared secret instead. It runs with the service-role
 * client — which bypasses RLS — and therefore resolves the workspace ONLY from
 * the verified secret, never from the request body.
 *
 * Nothing here contacts the lead (Constitution IV). The single email goes to
 * the workspace's own notify address.
 */

export const HIGH_INTENT_THRESHOLD = 70; // FR-Q-003

export const leadPayloadSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().max(200).optional(),
  message: z.string().max(10_000).default(""),
  source: z.string().trim().max(60).default("webhook"),
});

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

const classificationSchema = z.object({
  segment: z
    .enum(["student", "parent", "teacher", "institution", "partner", "other", "unknown"])
    .default("unknown"),
  intent: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
  score: z.number().min(0).max(100).default(0),
  rationale: z.string().default(""),
});

const CLASSIFIER_ROLE = `You classify inbound leads for an internal operations tool.

Use ONLY the workspace knowledge base and approved claims above to judge fit. Do not
assume facts about the product that are not stated there.

segment: one of student, parent, teacher, institution, partner, other, unknown
intent:  one of high, medium, low, unknown
score:   0-100, where >= ${HIGH_INTENT_THRESHOLD} means high intent
rationale: one sentence, citing what in the message led you there

If the message is too thin to judge, return unknown and a low score rather than guessing.

Return ONLY valid JSON: {"segment":"...","intent":"...","score":0,"rationale":"..."}`;

export class InvalidIngestSecretError extends Error {
  constructor() {
    super("Invalid or missing ingest credentials.");
    this.name = "InvalidIngestSecretError";
  }
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Constant-time comparison so a wrong key cannot be found by timing. */
function secretMatches(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Resolves the workspace from the shared secret alone. */
export async function workspaceForSecret(
  slug: string,
  secret: string,
): Promise<{ id: string; name: string; notify_email: string | null }> {
  const admin = createSupabaseAdminClient();

  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("id, name, notify_email, ingest_secret_hash")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!workspace?.ingest_secret_hash) throw new InvalidIngestSecretError();
  if (!secretMatches(secret, workspace.ingest_secret_hash)) {
    throw new InvalidIngestSecretError();
  }

  return { id: workspace.id, name: workspace.name, notify_email: workspace.notify_email };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

export async function ingestLead(
  workspace: { id: string; name: string; notify_email: string | null },
  payload: LeadPayload,
): Promise<{ leadId: string; duplicate: boolean; notified: boolean }> {
  const admin = createSupabaseAdminClient();

  // T4.8 — the same address twice is one lead, seen twice.
  const { data: existing } = await admin
    .from("leads")
    .select("id, seen_count")
    .eq("workspace_id", workspace.id)
    .ilike("email", payload.email)
    .maybeSingle();

  if (existing) {
    await admin
      .from("leads")
      .update({
        seen_count: existing.seen_count + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    await admin.rpc("write_audit_system", {
      target_workspace: workspace.id,
      audit_action: "lead.duplicate_seen",
      p_target_type: "lead",
      p_target_id: existing.id,
      p_meta: { source: payload.source },
    });

    return { leadId: existing.id, duplicate: true, notified: false };
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      email: payload.email,
      name: payload.name ?? null,
      message: payload.message,
      source: payload.source,
      raw_payload: payload,
      stage: "new",
    })
    .select("id")
    .single();

  if (error) throw error;

  await admin.rpc("write_audit_system", {
    target_workspace: workspace.id,
    audit_action: "lead.received",
    p_target_type: "lead",
    p_target_id: lead.id,
    p_meta: { source: payload.source },
  });

  const classified = await classifyLead(workspace.id, lead.id, payload);

  // Decisions §7: high intent is a score of 70 or more.
  const highIntent =
    classified !== null &&
    (Math.round(classified.score) >= HIGH_INTENT_THRESHOLD || classified.intent === "high");

  // 002 US9 AC4: every high-intent lead gets a "contact manually" task, whether
  // or not email is configured. The task is for the team; nothing goes to the lead.
  if (highIntent) {
    await admin.from("lead_tasks").insert({
      workspace_id: workspace.id,
      lead_id: lead.id,
      note: `Contact manually — high intent (score ${Math.round(classified!.score)}/100). No message has been sent.`,
    });
  }

  let notified = false;
  if (highIntent && workspace.notify_email && isEmailConfigured()) {
    await notifyTeamMember({
      // The workspace's own address — never payload.email.
      to: workspace.notify_email,
      subject: `High-intent lead: ${payload.name ?? payload.email}`,
      body: [
        `A high-intent lead arrived in ${workspace.name}.`,
        "",
        `From:    ${payload.name ?? "(no name)"} <${payload.email}>`,
        `Source:  ${payload.source}`,
        `Segment: ${classified.segment}`,
        `Score:   ${classified.score}/100`,
        "",
        `Why: ${classified.rationale}`,
        "",
        "Message:",
        payload.message || "(empty)",
        "",
        "No reply has been sent. Lumo-Ops does not contact leads.",
      ].join("\n"),
    });

    await admin
      .from("leads")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", lead.id);

    await admin.rpc("write_audit_system", {
      target_workspace: workspace.id,
      audit_action: "lead.owner_notified",
      p_target_type: "lead",
      p_target_id: lead.id,
      p_meta: {},
    });

    notified = true;
  }

  return { leadId: lead.id, duplicate: false, notified };
}

/** Classifies from the knowledge base only (FR-L-002). Best-effort. */
async function classifyLead(
  workspaceId: string,
  leadId: string,
  payload: LeadPayload,
): Promise<z.infer<typeof classificationSchema> | null> {
  const admin = createSupabaseAdminClient();

  if (!isProviderConfigured()) return null;

  const { data: claimSet } = await admin
    .from("claim_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Constitution II applies here too: no claim set, or no approved claims
  // (decisions §7), no generation. Checked before a cap slot is reserved.
  if (!claimSet || !hasApprovedClaims(claimSet as never)) return null;

  const { data: docs } = await admin
    .from("knowledge_docs")
    .select("title, category, body")
    .eq("workspace_id", workspaceId);

  const { data: runId } = await admin.rpc("claim_ai_run_system", {
    target_workspace: workspaceId,
    run_action: "lead.classify",
    run_model: process.env.AI_MODEL ?? null,
  });

  if (!runId) return null; // cap reached; the lead is stored, just unclassified

  try {
    const result = await generate(
      [
        {
          role: "system",
          content: assembleSystemPrompt(CLASSIFIER_ROLE, {
            claimSet: claimSet as never,
            docs: docs ?? [],
          }),
        },
        {
          role: "user",
          content: `From: ${payload.name ?? "(no name)"} <${payload.email}>\nSource: ${payload.source}\n\n${payload.message}`,
        },
      ],
      { jsonMode: true },
    );

    const classified = classificationSchema.parse(
      JSON.parse(extractJson(result.text)),
    );

    await admin
      .from("leads")
      .update({
        segment: classified.segment,
        intent: classified.intent,
        score: Math.round(classified.score),
        rationale: classified.rationale,
        stage: "classified",
        run_id: runId,
      })
      .eq("id", leadId);

    await admin.rpc("finish_ai_run_system", {
      run_id: runId,
      final_status: "succeeded",
      p_prompt_tokens: result.promptTokens,
      p_output_tokens: result.outputTokens,
      p_cost_usd: null,
      p_error: null,
    });

    return classified;
  } catch (error) {
    await admin.rpc("finish_ai_run_system", {
      run_id: runId,
      final_status: "failed",
      p_prompt_tokens: null,
      p_output_tokens: null,
      p_cost_usd: null,
      p_error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
    });
    return null;
  }
}
