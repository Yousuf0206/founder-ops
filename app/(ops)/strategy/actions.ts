"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import { NoEvidencedIdeasError, runStrategy } from "@/lib/strategy/run";
import { UnparseableOutputError } from "@/lib/ai/research";
import { CapReachedError, ProviderNotConfiguredError, writeAudit } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";
import { createSupabaseServerClient } from "@/lib/db/server";

export type StrategyState = { error?: string; done?: string };

function messageFor(error: unknown): string {
  if (
    error instanceof AuthError ||
    error instanceof MissingClaimSetError ||
    error instanceof CapReachedError ||
    error instanceof ProviderNotConfiguredError ||
    error instanceof NoEvidencedIdeasError
  ) {
    return error.message;
  }
  if (error instanceof UnparseableOutputError) {
    return "The model returned something unreadable. The run was logged; try again.";
  }
  if (error instanceof ProviderError) return `Provider error: ${error.message}`;

  console.error(error);
  return "Something went wrong. Try again.";
}

const optionalId = z
  .string()
  .transform((value) => value.trim() || undefined)
  .pipe(z.string().uuid().optional());

export async function runStrategyAction(
  _prev: StrategyState,
  formData: FormData,
): Promise<StrategyState> {
  try {
    const session = await requireWriter();

    const research_report_id = optionalId.safeParse(String(formData.get("research_report_id") ?? ""));
    const analyze_run_id = optionalId.safeParse(String(formData.get("analyze_run_id") ?? ""));
    if (!research_report_id.success || !analyze_run_id.success) return { error: "Choose a valid source." };
    if (!research_report_id.data && !analyze_run_id.data) {
      return { error: "Choose a research report, an analysis, or both." };
    }

    const { ideaIds } = await runStrategy(session, {
      research_report_id: research_report_id.data,
      analyze_run_id: analyze_run_id.data,
    });

    revalidatePath("/strategy");
    return { done: `${ideaIds.length} evidenced idea${ideaIds.length === 1 ? "" : "s"} saved.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

const discardSchema = z.object({ idea_id: z.string().uuid() });

export async function discardIdeaAction(formData: FormData): Promise<void> {
  const session = await requireWriter();
  const workspaceId = session.activeWorkspace.workspaceId;

  const parsed = discardSchema.safeParse({ idea_id: formData.get("idea_id") });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("strategy_ideas")
    .update({ status: "discarded" })
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.idea_id);

  if (!error) {
    await writeAudit(workspaceId, "strategy.idea_discarded", "strategy_idea", parsed.data.idea_id, {});
  }

  revalidatePath("/strategy");
}
