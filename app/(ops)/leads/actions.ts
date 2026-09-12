"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthError, requireWriter } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { writeAudit } from "@/lib/ai/run";

export type StageState = { error?: string; done?: string };

const stageSchema = z.enum([
  "new",
  "classified",
  "reviewing",
  "contacted",
  "qualified",
  "archived",
]);

export async function setStageAction(
  _prev: StageState,
  formData: FormData,
): Promise<StageState> {
  const leadId = String(formData.get("lead_id") ?? "");

  try {
    const session = await requireWriter();

    const parsed = stageSchema.safeParse(formData.get("stage"));
    if (!parsed.success) return { error: "Unknown stage." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("leads")
      .update({ stage: parsed.data })
      .eq("workspace_id", session.activeWorkspace.workspaceId)
      .eq("id", leadId)
      .select("id");

    if (error) throw error;
    if ((data ?? []).length === 0) return { error: "That lead no longer exists." };

    await writeAudit(
      session.activeWorkspace.workspaceId,
      "lead.stage_changed",
      "lead",
      leadId,
      { stage: parsed.data },
    );
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error(error);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { done: "Stage updated. Nothing was sent." };
}
