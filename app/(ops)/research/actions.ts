"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import { runResearch, UnparseableOutputError } from "@/lib/ai/research";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";

export type ResearchState = { error?: string };

/**
 * Turns each failure into something the user can act on.
 *
 * Not exported: a "use server" module may only export async functions, since
 * every export becomes a callable server action.
 */
function runErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof MissingClaimSetError) return error.message;
  if (error instanceof CapReachedError) return error.message;
  if (error instanceof ProviderNotConfiguredError) return error.message;
  if (error instanceof UnparseableOutputError) {
    return "The model returned something unreadable. The failed run was logged; try again.";
  }
  if (error instanceof ProviderError) return `Provider error: ${error.message}`;

  console.error(error);
  return "Something went wrong. Try again.";
}

export async function runResearchAction(
  _prev: ResearchState,
  formData: FormData,
): Promise<ResearchState> {
  let reportId: string;

  try {
    const session = await requireWriter();

    const notes = String(formData.get("notes") ?? "").trim();
    if (!notes) return { error: "Paste some notes to analyse." };

    const result = await runResearch(session, {
      notes,
      title: String(formData.get("title") ?? "").trim() || undefined,
    });
    reportId = result.reportId;
  } catch (error) {
    return { error: runErrorMessage(error) };
  }

  revalidatePath("/research");
  redirect(`/research/${reportId}`);
}
