"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthError,
  createDoc,
  deleteDoc,
  requireWriter,
  updateDoc,
  upsertClaimSet,
} from "@/lib/knowledge/repo";
import {
  claimSetUpdateSchema,
  formatIssues,
  knowledgeDocCreateSchema,
  linesToClaims,
} from "@/lib/validation/knowledge";

/**
 * UI server actions. They go through the same repo and the same Zod schemas as
 * the API routes, so validation and the role gate cannot drift between the two
 * entry points.
 */

export type ActionState = { error?: string };

function messageFor(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  console.error(error);
  return "Something went wrong. Try again.";
}

export async function createDocAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let id: string;

  try {
    const session = await requireWriter();

    const parsed = knowledgeDocCreateSchema.safeParse({
      title: formData.get("title") ?? "",
      body: formData.get("body") ?? "",
      category: formData.get("category") || "general",
      last_verified_at: null,
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    const doc = await createDoc(session, parsed.data);
    id = doc.id;
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/knowledge");
  redirect(`/knowledge/${id}`);
}

export async function updateDocAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");

  try {
    const session = await requireWriter();

    const markVerified = formData.get("mark_verified") === "on";

    const parsed = knowledgeDocCreateSchema.safeParse({
      title: formData.get("title") ?? "",
      body: formData.get("body") ?? "",
      category: formData.get("category") || "general",
      last_verified_at: markVerified
        ? new Date().toISOString()
        : (formData.get("last_verified_at") as string | null) || null,
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    const doc = await updateDoc(session.activeWorkspace.workspaceId, id, parsed.data);
    if (!doc) return { error: "That document no longer exists." };
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${id}`);
  return {};
}

export async function deleteDocAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");

  const session = await requireWriter();
  await deleteDoc(session.activeWorkspace.workspaceId, id);

  revalidatePath("/knowledge");
  redirect("/knowledge");
}

export async function saveClaimsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireWriter();

    const parsed = claimSetUpdateSchema.safeParse({
      approved_claims: linesToClaims(String(formData.get("approved_claims") ?? "")),
      forbidden_claims: linesToClaims(String(formData.get("forbidden_claims") ?? "")),
      brand_voice: String(formData.get("brand_voice") ?? ""),
    });

    if (!parsed.success) return { error: formatIssues(parsed.error) };

    await upsertClaimSet(session, parsed.data);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/knowledge/claims");
  return {};
}
