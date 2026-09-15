"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import {
  contentPackageRequestSchema,
  ForbiddenClaimError,
  runContentPackage,
  UnparseableContentError,
} from "@/lib/ai/content";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";
import { formatIssues } from "@/lib/validation/knowledge";

export type ContentState = { error?: string };

function messageFor(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof MissingClaimSetError) return error.message;
  if (error instanceof CapReachedError) return error.message;
  if (error instanceof ProviderNotConfiguredError) return error.message;
  if (error instanceof ForbiddenClaimError) return error.message;
  if (error instanceof UnparseableContentError) {
    return "The model returned something unreadable. The run was logged; try again.";
  }
  if (error instanceof ProviderError) return `Provider error: ${error.message}`;

  console.error(error);
  return "Something went wrong. Try again.";
}

/** 002 T1.7 — one run drafts a native asset for each chosen platform. */
export async function runContentAction(
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  let draftIds: string[];

  try {
    const session = await requireWriter();

    const ideaId = String(formData.get("strategy_idea_id") ?? "").trim();
    const parsed = contentPackageRequestSchema.safeParse({
      topic: formData.get("topic") ?? "",
      platforms: formData.getAll("platforms").map(String),
      audience: formData.get("audience") ?? "",
      tone: formData.get("tone") ?? "",
      strategy_idea_id: ideaId || undefined,
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    ({ draftIds } = await runContentPackage(session, parsed.data));
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/content");
  revalidatePath("/approvals");
  redirect(draftIds.length === 1 ? `/content/${draftIds[0]}` : "/content");
}
