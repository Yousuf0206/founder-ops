"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import { runAnalyze } from "@/lib/analyze/run";
import { FetchFailedError, RobotsDisallowedError, UnsafeUrlError } from "@/lib/analyze/fetch";
import { UnparseableOutputError } from "@/lib/ai/research";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";

export type AnalyzeState = { error?: string };

function messageFor(error: unknown): string {
  if (
    error instanceof AuthError ||
    error instanceof MissingClaimSetError ||
    error instanceof CapReachedError ||
    error instanceof ProviderNotConfiguredError ||
    error instanceof UnsafeUrlError ||
    error instanceof RobotsDisallowedError ||
    error instanceof FetchFailedError
  ) {
    return error.message;
  }
  if (error instanceof UnparseableOutputError) {
    return "The model returned something unreadable. The failed run was logged; try again.";
  }
  if (error instanceof ProviderError) return `Provider error: ${error.message}`;

  console.error(error);
  return "Something went wrong. Try again.";
}

export async function runAnalyzeAction(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  let analysisId: string;

  try {
    const session = await requireWriter();

    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { error: "Enter a URL to analyse." };

    ({ analysisId } = await runAnalyze(session, { url }));
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/analyze");
  redirect(`/analyze/${analysisId}`);
}
