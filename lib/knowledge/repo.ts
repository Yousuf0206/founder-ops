import "server-only";

import { getOpsSession, canWrite, type OpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import type {
  ClaimSetUpdate,
  KnowledgeDocCreate,
  KnowledgeDocUpdate,
} from "@/lib/validation/knowledge";

/**
 * Knowledge base data access, shared by the API routes and the UI server
 * actions so the two cannot drift.
 *
 * Every query is scoped by the caller's active workspace_id explicitly, even
 * though RLS would scope it anyway. Belt and braces: the explicit filter makes
 * the intent readable, and RLS makes it true.
 */

export type KnowledgeDoc = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  category: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaimSet = {
  workspace_id: string;
  approved_claims: string[];
  forbidden_claims: string[];
  brand_voice: string;
  updated_at: string;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Resolves the session, or throws the right HTTP-shaped error. */
export async function requireSession(): Promise<OpsSession> {
  const session = await getOpsSession();
  if (!session) throw new AuthError("Not signed in, or not a member of any workspace.", 401);
  return session;
}

/** Resolves the session and asserts the caller may write. (T1.7) */
export async function requireWriter(): Promise<OpsSession> {
  const session = await requireSession();
  if (!canWrite(session.activeWorkspace.role)) {
    throw new AuthError("Viewers cannot modify the knowledge base.", 403);
  }
  return session;
}

// --- knowledge_docs --------------------------------------------------------

export async function listDocs(workspaceId: string): Promise<KnowledgeDoc[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as KnowledgeDoc[];
}

export async function getDoc(workspaceId: string, id: string): Promise<KnowledgeDoc | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as KnowledgeDoc | null) ?? null;
}

export async function createDoc(
  session: OpsSession,
  input: KnowledgeDocCreate,
): Promise<KnowledgeDoc> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .insert({
      workspace_id: session.activeWorkspace.workspaceId,
      created_by: session.userId,
      ...input,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as KnowledgeDoc;
}

export async function updateDoc(
  workspaceId: string,
  id: string,
  input: KnowledgeDocUpdate,
): Promise<KnowledgeDoc | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .update(input)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as KnowledgeDoc | null) ?? null;
}

export async function deleteDoc(workspaceId: string, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}

// --- claim_sets ------------------------------------------------------------

/**
 * Returns the workspace's claim set, or null when none has been created yet.
 *
 * Null is meaningful, not an error state to paper over: Constitution III means
 * generation must refuse when it is null rather than fall back to an unbound
 * prompt. Phase 2's prompt assembly depends on that distinction.
 */
export async function getClaimSet(workspaceId: string): Promise<ClaimSet | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("claim_sets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  return (data as ClaimSet | null) ?? null;
}

export async function upsertClaimSet(
  session: OpsSession,
  input: ClaimSetUpdate,
): Promise<ClaimSet> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("claim_sets")
    .upsert(
      {
        workspace_id: session.activeWorkspace.workspaceId,
        updated_by: session.userId,
        ...input,
      },
      { onConflict: "workspace_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ClaimSet;
}
