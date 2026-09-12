"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, requireSession, requireWriter } from "@/lib/knowledge/repo";
import { campaignRequestSchema, runCampaign } from "@/lib/ai/campaign";
import { ForbiddenClaimError, UnparseableContentError } from "@/lib/ai/content";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";
import { createSupabaseServerClient } from "@/lib/db/server";
import { formatIssues } from "@/lib/validation/knowledge";

export type CampaignState = { error?: string; done?: string };

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

  const message = error instanceof Error ? error.message : "";
  if (/approval rights|already been decided/i.test(message)) return message;

  console.error(error);
  return "Something went wrong. Try again.";
}

export async function runCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  let campaignId: string;

  try {
    const session = await requireWriter();

    const parsed = campaignRequestSchema.safeParse({
      goal: formData.get("goal") ?? "",
      audience: formData.get("audience") ?? "",
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    const result = await runCampaign(session, parsed.data);
    campaignId = result.campaignId;
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

export async function decideCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const campaignId = String(formData.get("campaign_id") ?? "");
  const decision = String(formData.get("decision") ?? "");

  try {
    await requireSession();

    if (decision !== "approved" && decision !== "rejected") {
      return { error: "Unknown decision." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("decide_on_campaign", {
      campaign_id: campaignId,
      decision,
      reviewer_notes: String(formData.get("notes") ?? ""),
    });

    if (error) throw error;
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return {
    done:
      decision === "approved"
        ? "Approved. No email was sent — the draft is yours to send by hand."
        : "Rejected.",
  };
}
