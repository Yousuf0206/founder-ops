import "server-only";

import type { OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getClaimSet, listDocs, type ClaimSet } from "@/lib/knowledge/repo";
import { getProductFacts, type ProductFacts } from "@/lib/facts/repo";
import {
  assembleSystemPrompt,
  hasProductFacts,
  MissingClaimSetError,
} from "@/lib/prompts/assemble";
import {
  generate,
  isProviderConfigured,
  type ChatMessage,
  type GenerationResult,
} from "@/lib/ai/provider";

/**
 * The guarded path every AI run takes (T2.2, T2.6, T2.8, T2.11).
 *
 * Order matters and is deliberate:
 *   1. a binding source of product truth must exist → refuse before spending
 *      anything. v3.0.0 (T-A7): approved claims OR auto-extracted product facts
 *      satisfy this; neither one present is still a refusal.
 *   2. reserve a slot against the cap → transactional, in the database
 *   3. call the provider
 *   4. close the run out, success or failure
 *
 * A run that fails still occupies its cap slot. That is intended: a failing
 * provider that is retried in a loop costs real money, and the cap is a cost
 * control, not a success counter.
 */

export class CapReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapReachedError";
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider is configured. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL " +
        "on the server.",
    );
    this.name = "ProviderNotConfiguredError";
  }
}

/**
 * The refusal claim_ai_run() just logged carries the counts ("3 of 3 runs used
 * today"), so read it back rather than recomposing the sentence here and
 * letting the two drift. Falls back to the bare fact if the row can't be read.
 */
async function capRefusalMessage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
): Promise<string> {
  const { data } = await supabase
    .from("ai_run_logs")
    .select("error")
    .eq("workspace_id", workspaceId)
    .eq("status", "refused")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.error ?? "daily AI run cap reached";
}

export type RunContext = {
  runId: string;
  /**
   * Null on a first-run workspace, which is bound by product facts instead
   * (T-A7). Callers checking output for forbidden content must use
   * `findForbiddenViolations`, which covers both layers, not
   * `findForbiddenClaims` alone.
   */
  claimSet: ClaimSet | null;
  productFacts: ProductFacts | null;
  result: GenerationResult;
};

export async function runGeneration(options: {
  session: OpsSession;
  action: string;
  role: string;
  userPrompt: string;
  jsonMode?: boolean;
  includeDocs?: boolean;
}): Promise<RunContext> {
  const { session, action, role, userPrompt, jsonMode, includeDocs = true } = options;
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  if (!isProviderConfigured()) throw new ProviderNotConfiguredError();

  // 1. Product truth first. Nothing binding, no generation — and no cap consumed.
  //    A first-run workspace (FR-GI-S-003) has no claim set at all, so facts are
  //    read here too rather than letting the pre-flight refuse what the prompt
  //    assembler would happily have bound.
  const [claimSet, productFacts] = await Promise.all([
    getClaimSet(workspaceId),
    getProductFacts(workspaceId),
  ]);
  if (!claimSet && !hasProductFacts(productFacts)) throw new MissingClaimSetError();

  const docs = includeDocs ? await listDocs(workspaceId) : [];
  const systemPrompt = assembleSystemPrompt(role, {
    claimSet,
    productFacts,
    docs: docs.map((doc) => ({
      title: doc.title,
      category: doc.category,
      body: doc.body,
    })),
  });

  // 2. Reserve a cap slot. Returns null — and logs the refusal — at the cap.
  const { data: runId, error: claimError } = await supabase.rpc("claim_ai_run", {
    target_workspace: workspaceId,
    run_action: action,
    run_model: process.env.AI_MODEL ?? null,
  });

  if (claimError) throw claimError;

  if (!runId) {
    throw new CapReachedError(await capRefusalMessage(supabase, workspaceId));
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // 3 & 4. Call, then always close the run out.
  try {
    const result = await generate(messages, { jsonMode });

    await supabase.rpc("finish_ai_run", {
      run_id: runId,
      final_status: "succeeded",
      p_prompt_tokens: result.promptTokens,
      p_output_tokens: result.outputTokens,
      p_cost_usd: null,
      p_error: null,
    });

    return { runId: runId as string, claimSet, productFacts, result };
  } catch (error) {
    await supabase.rpc("finish_ai_run", {
      run_id: runId,
      final_status: "failed",
      p_prompt_tokens: null,
      p_output_tokens: null,
      p_cost_usd: null,
      p_error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    });
    throw error;
  }
}

/** Writes an audit row. Never silently skipped — callers must await it. */
export async function writeAudit(
  workspaceId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("write_audit", {
    target_workspace: workspaceId,
    audit_action: action,
    p_target_type: targetType ?? null,
    p_target_id: targetId ?? null,
    p_meta: meta,
  });
  if (error) throw error;
}

/** Runs used today and the workspace cap, for settings and cap displays. */
export async function capStatus(
  workspaceId: string,
): Promise<{ used: number; cap: number }> {
  const supabase = await createSupabaseServerClient();

  const [{ data: used }, { data: workspace }] = await Promise.all([
    supabase.rpc("ai_runs_used_today", { target_workspace: workspaceId }),
    supabase.from("workspaces").select("daily_run_cap").eq("id", workspaceId).maybeSingle(),
  ]);

  return {
    used: (used as number | null) ?? 0,
    cap: workspace?.daily_run_cap ?? 0,
  };
}
