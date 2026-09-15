import "server-only";

import { createSupabaseServerClient } from "@/lib/db/server";
import type { ContentPayload } from "@/lib/ai/content";

/** Approvals data access (FR-A). */

export type ContentDraft = {
  id: string;
  workspace_id: string;
  topic: string;
  platform: string;
  audience: string;
  tone: string;
  length_hint: string;
  payload_json: ContentPayload;
  original_payload: ContentPayload | null;
  status: "draft" | "awaiting_approval" | "approved" | "rejected" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Approval = {
  id: string;
  target_type: string;
  target_id: string;
  status: "approved" | "rejected" | "edited_and_approved";
  reviewer_id: string | null;
  notes: string;
  created_at: string;
};

export async function listDrafts(
  workspaceId: string,
  statuses?: ContentDraft["status"][],
): Promise<ContentDraft[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("content_drafts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (statuses && statuses.length > 0) query = query.in("status", statuses);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ContentDraft[];
}

export async function getDraft(
  workspaceId: string,
  id: string,
): Promise<ContentDraft | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as ContentDraft | null) ?? null;
}

export async function listApprovalsFor(
  workspaceId: string,
  targetId: string,
): Promise<Approval[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Approval[];
}

/** True when the signed-in user may decide on this workspace's drafts. */
export async function callerCanApprove(workspaceId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("can_approve", {
    target_workspace: workspaceId,
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * Records a decision. All four writes — status, preserved original, approval
 * row, audit row — happen inside decide_on_draft(), so an approval cannot exist
 * without its audit entry (SC-006).
 */
export async function decideOnDraft(input: {
  draftId: string;
  decision: "approved" | "rejected" | "edited_and_approved";
  editedPayload?: ContentPayload;
  notes?: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_on_draft", {
    draft_id: input.draftId,
    decision: input.decision,
    edited_payload: input.editedPayload ?? null,
    reviewer_notes: input.notes ?? "",
  });
  if (error) throw error;
}
