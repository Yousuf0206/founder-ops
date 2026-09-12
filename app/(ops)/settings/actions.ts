"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthError, requireSession } from "@/lib/knowledge/repo";
import { isOwner } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { writeAudit } from "@/lib/ai/run";
import { formatIssues } from "@/lib/validation/knowledge";

export type SettingsState = { error?: string; done?: string };

const settingsSchema = z.object({
  daily_run_cap: z.coerce.number().int().min(0).max(10_000),
  notify_email: z.union([z.string().trim().email(), z.literal("")]).default(""),
});

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const session = await requireSession();
    const workspaceId = session.activeWorkspace.workspaceId;

    if (!isOwner(session.activeWorkspace.role)) {
      return { error: "Only an owner can change workspace settings." };
    }

    const parsed = settingsSchema.safeParse({
      daily_run_cap: formData.get("daily_run_cap"),
      notify_email: formData.get("notify_email") ?? "",
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("workspaces")
      .update({
        daily_run_cap: parsed.data.daily_run_cap,
        notify_email: parsed.data.notify_email || null,
      })
      .eq("id", workspaceId);

    if (error) throw error;

    // A cap change is a cost-control change, so it belongs in the audit trail.
    await writeAudit(workspaceId, "settings.updated", "workspace", workspaceId, {
      daily_run_cap: parsed.data.daily_run_cap,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error(error);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/settings");
  return { done: "Settings saved." };
}

const approvalGrantSchema = z.object({
  membership_id: z.string().uuid(),
  can_approve: z.enum(["true", "false"]),
});

/** FR-Q-001: an owner grants or revokes an editor's approval rights. */
export async function setApprovalRightAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;

  if (!isOwner(session.activeWorkspace.role)) return;

  const parsed = approvalGrantSchema.safeParse({
    membership_id: formData.get("membership_id"),
    can_approve: formData.get("can_approve"),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("memberships")
    .update({ can_approve: parsed.data.can_approve === "true" })
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.membership_id);

  await writeAudit(workspaceId, "membership.approval_right_changed", "membership", parsed.data.membership_id, {
    can_approve: parsed.data.can_approve === "true",
  });

  revalidatePath("/settings");
}
