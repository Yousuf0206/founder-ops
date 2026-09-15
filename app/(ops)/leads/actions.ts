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

const taskSchema = z.object({
  lead_id: z.string().uuid(),
  note: z.string().trim().min(1, "Write the task.").max(2000),
});

/** 002 T4.2: a task for a person. Adding one contacts nobody. */
export async function addLeadTaskAction(formData: FormData): Promise<void> {
  const session = await requireWriter();
  const workspaceId = session.activeWorkspace.workspaceId;

  const parsed = taskSchema.safeParse({ lead_id: formData.get("lead_id"), note: formData.get("note") });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lead_tasks")
    .insert({ workspace_id: workspaceId, lead_id: parsed.data.lead_id, note: parsed.data.note, created_by: session.userId })
    .select("id")
    .single();

  if (!error && data) {
    await writeAudit(workspaceId, "lead.task_added", "lead", parsed.data.lead_id, { task_id: data.id });
  }

  revalidatePath(`/leads/${parsed.data.lead_id}`);
}

const toggleSchema = z.object({
  task_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  done: z.enum(["true", "false"]),
});

export async function toggleLeadTaskAction(formData: FormData): Promise<void> {
  const session = await requireWriter();
  const workspaceId = session.activeWorkspace.workspaceId;

  const parsed = toggleSchema.safeParse({
    task_id: formData.get("task_id"),
    lead_id: formData.get("lead_id"),
    done: formData.get("done"),
  });
  if (!parsed.success) return;

  const done = parsed.data.done === "true";
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("lead_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.task_id);

  revalidatePath(`/leads/${parsed.data.lead_id}`);
}
