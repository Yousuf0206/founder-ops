"use server";

import { revalidatePath } from "next/cache";

import { AuthError, requireSession } from "@/lib/knowledge/repo";
import { contentPayloadSchema } from "@/lib/ai/content";
import { decideOnDraft } from "@/lib/approvals/repo";
import { formatIssues } from "@/lib/validation/knowledge";

export type DecisionState = { error?: string; done?: string };

function messageFor(error: unknown): string {
  if (error instanceof AuthError) return error.message;

  // Postgres raises these from decide_on_draft(); surface them as written,
  // since they say exactly what is wrong (no rights, already decided).
  const message = error instanceof Error ? error.message : "";
  if (/approval rights|already been decided|only an approved draft/i.test(message)) {
    return message;
  }

  console.error(error);
  return "Something went wrong. Try again.";
}

export async function decideAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const draftId = String(formData.get("draft_id") ?? "");
  const decision = String(formData.get("decision") ?? "");

  try {
    await requireSession();

    if (decision !== "approved" && decision !== "rejected" && decision !== "edited_and_approved") {
      return { error: "Unknown decision." };
    }

    let editedPayload;
    if (decision === "edited_and_approved") {
      const parsed = contentPayloadSchema.safeParse({
        hook: formData.get("hook") ?? "",
        script: formData.get("script") ?? "",
        captions: splitLines(formData.get("captions")),
        titles: splitLines(formData.get("titles")),
        hashtags: splitLines(formData.get("hashtags")),
        cta: formData.get("cta") ?? "",
        visual_plan: formData.get("visual_plan") ?? "",
      });

      if (!parsed.success) return { error: formatIssues(parsed.error) };
      editedPayload = parsed.data;
    }

    await decideOnDraft({
      draftId,
      decision,
      editedPayload,
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/approvals");
  revalidatePath("/content");
  revalidatePath(`/content/${draftId}`);
  return { done: `Recorded: ${decision.replace(/_/g, " ")}.` };
}

function splitLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
