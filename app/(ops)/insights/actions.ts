"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthError, requireSession, requireWriter } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { refreshMetricSnapshots } from "@/lib/learn/metrics";
import { NothingPublishedError, runLearnSummary } from "@/lib/learn/summary";
import { UnparseableOutputError } from "@/lib/ai/research";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";

export type InsightsState = { error?: string; done?: string };

function messageFor(error: unknown): string {
  if (
    error instanceof AuthError ||
    error instanceof NothingPublishedError ||
    error instanceof MissingClaimSetError ||
    error instanceof CapReachedError ||
    error instanceof ProviderNotConfiguredError
  ) {
    return error.message;
  }
  if (error instanceof UnparseableOutputError) return "The model returned something unreadable. Try again.";
  if (error instanceof ProviderError) return `Provider error: ${error.message}`;
  console.error(error);
  return "Something went wrong. Try again.";
}

/** FR-Q-105 is open: metrics are refreshed on demand only. */
export async function refreshMetricsAction(): Promise<void> {
  const session = await requireSession();
  await refreshMetricSnapshots(session.activeWorkspace.workspaceId);
  revalidatePath("/insights");
}

/** FR-Q-106 is open: the summary runs on demand, not weekly. */
export async function generateSummaryAction(_prev: InsightsState, _formData: FormData): Promise<InsightsState> {
  try {
    const session = await requireWriter();
    const { proposals } = await runLearnSummary(session);
    revalidatePath("/insights");
    revalidatePath("/");
    return {
      done: `Summary saved${proposals > 0 ? `, with ${proposals} knowledge proposal${proposals === 1 ? "" : "s"} waiting for review` : ""}.`,
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

const decisionSchema = z.object({ proposal_id: z.string().uuid(), accept: z.enum(["true", "false"]) });

/** US6 AC5: the knowledge base changes only when a person accepts. */
export async function decideProposalAction(formData: FormData): Promise<void> {
  const parsed = decisionSchema.safeParse({
    proposal_id: formData.get("proposal_id"),
    accept: formData.get("accept"),
  });
  if (!parsed.success) return;

  try {
    await requireWriter();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("decide_knowledge_proposal", {
      p_proposal_id: parsed.data.proposal_id,
      p_accept: parsed.data.accept === "true",
    });
    if (error) console.error(error);
  } catch (error) {
    messageFor(error);
  }

  revalidatePath("/insights");
  revalidatePath("/knowledge/claims");
}
