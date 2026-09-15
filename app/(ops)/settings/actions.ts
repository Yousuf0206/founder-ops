"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hashSecret } from "@/lib/leads/ingest";
import { INVITATION_TTL_DAYS, invitationCreateSchema } from "@/lib/validation/workspace";

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

export type InviteState = { error?: string; done?: string };

/** An owner invites someone by email. The link is shown for the owner to share. */
export async function createInvitationAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  try {
    const session = await requireSession();
    const workspaceId = session.activeWorkspace.workspaceId;

    if (!isOwner(session.activeWorkspace.role)) {
      return { error: "Only an owner can invite members." };
    }

    const parsed = invitationCreateSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
    });
    if (!parsed.success) return { error: formatIssues(parsed.error) };
    if (parsed.data.email === session.email.toLowerCase()) {
      return { error: "You are already a member of this workspace." };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        workspace_id: workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        token: randomBytes(24).toString("base64url"),
        invited_by: session.userId,
        expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      return { error: "An invitation to this email is already pending." };
    }
    if (error) throw error;

    await writeAudit(workspaceId, "invitation.created", "invitation", data.id, {
      email: parsed.data.email,
      role: parsed.data.role,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error(error);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/settings");
  return { done: "Invitation created. Copy its link below and send it." };
}

const invitationIdSchema = z.object({ invitation_id: z.string().uuid() });

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  if (!isOwner(session.activeWorkspace.role)) return;

  const parsed = invitationIdSchema.safeParse({ invitation_id: formData.get("invitation_id") });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.invitation_id);

  if (!error) {
    await writeAudit(workspaceId, "invitation.revoked", "invitation", parsed.data.invitation_id, {});
  }

  revalidatePath("/settings");
}

const memberSchema = z.object({ membership_id: z.string().uuid() });

/**
 * US7 AC4: removing a member ends their access to every row immediately,
 * because every policy checks membership. The database refuses to remove the
 * last owner (migration 0013).
 */
export async function removeMemberAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  if (!isOwner(session.activeWorkspace.role)) return;

  const parsed = memberSchema.safeParse({ membership_id: formData.get("membership_id") });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.membership_id)
    .neq("user_id", session.userId)
    .select("id");

  if (!error && (data ?? []).length > 0) {
    await writeAudit(workspaceId, "membership.removed", "membership", parsed.data.membership_id, {});
  }

  revalidatePath("/settings");
}

export type IngestSecretState = { error?: string; secret?: string };

/**
 * Generates a new lead-ingest secret, replacing any old one immediately. Only
 * the hash is stored, so the secret is returned once for the owner to copy.
 */
export async function rotateIngestSecretAction(
  _prev: IngestSecretState,
  _formData: FormData,
): Promise<IngestSecretState> {
  const secret = randomBytes(32).toString("base64url");

  try {
    const session = await requireSession();
    const workspaceId = session.activeWorkspace.workspaceId;

    if (!isOwner(session.activeWorkspace.role)) {
      return { error: "Only an owner can change the ingest secret." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("workspaces")
      .update({ ingest_secret_hash: hashSecret(secret) })
      .eq("id", workspaceId);
    if (error) throw error;

    await writeAudit(workspaceId, "settings.ingest_secret_rotated", "workspace", workspaceId, {});
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error(error);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/settings");
  return { secret };
}
