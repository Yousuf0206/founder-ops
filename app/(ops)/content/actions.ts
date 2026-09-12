"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import { contentRequestSchema, ForbiddenClaimError, runContent, UnparseableContentError } from "@/lib/ai/content";
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

export async function runContentAction(
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  let draftId: string;

  try {
    const session = await requireWriter();

    const parsed = contentRequestSchema.safeParse({
      topic: formData.get("topic") ?? "",
      platform: formData.get("platform") ?? "",
      audience: formData.get("audience") ?? "",
      tone: formData.get("tone") ?? "",
      length_hint: formData.get("length_hint") ?? "",
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    const result = await runContent(session, parsed.data);
    draftId = result.draftId;
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/content");
  revalidatePath("/approvals");
  redirect(`/content/${draftId}`);
}
