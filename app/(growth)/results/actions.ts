"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { canWrite } from "@/lib/auth/session";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { ProviderError, providerFailureMessage, configuredModel } from "@/lib/ai/provider";
import { errorClass, errorKind, logEvent } from "@/lib/obs/log";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { AuthError } from "@/lib/knowledge/repo";
import {
  NoAnalysisError,
  PackForbiddenContentError,
  UnparseablePackError,
  runGrowthPack,
} from "@/lib/growth/pack";

export type PackState = { error?: string };

/**
 * Same principle as the Start action (NFR-GI-004): every failure a founder can
 * act on gets its own sentence, and the catch-all means a genuine bug.
 */
function messageFor(error: unknown): string {
  if (
    error instanceof NoAnalysisError ||
    error instanceof UnparseablePackError ||
    error instanceof PackForbiddenContentError ||
    error instanceof CapReachedError ||
    error instanceof ProviderNotConfiguredError ||
    error instanceof AuthError
  ) {
    return error.message;
  }
  if (error instanceof MissingClaimSetError) {
    // Unlike the analysis, a pack is NOT exempt from the claim gate — by the
    // time it runs, the analysis has seeded product facts, so the gate passing
    // is the normal case and its refusal is real information.
    return (
      "We don't have anything to write from yet. Paste your product URL at Start " +
      "so we can read your page first."
    );
  }
  if (error instanceof ProviderError) {
    return providerFailureMessage(error);
  }

  console.error(error);
  return "Something went wrong. Try again.";
}

/** Generates a pack from the latest analysis. The CTA on Results calls this. */
export async function generatePackAction(
  _prev: PackState,
  _formData: FormData,
): Promise<PackState> {
  // redirect() throws to signal, so it must happen outside the try — inside,
  // messageFor() would swallow the signal and report a generic failure.
  const startedAt = Date.now();
  let loggedWorkspaceId: string | null = null;

  try {
    const session = await getOpsSession();
    if (!session) return { error: "Your session expired. Sign in and try again." };
    if (!canWrite(session.activeWorkspace.role)) {
      return { error: "Viewers cannot generate a pack." };
    }
    loggedWorkspaceId = session.activeWorkspace.workspaceId;

    const { packId } = await runGrowthPack(session);

    logEvent({
      event: "growth.pack",
      outcome: "ok",
      latencyMs: Date.now() - startedAt,
      runId: packId,
      workspaceId: loggedWorkspaceId,
      model: configuredModel(),
    });
  } catch (error) {
    logEvent({
      event: "growth.pack",
      outcome: "error",
      latencyMs: Date.now() - startedAt,
      workspaceId: loggedWorkspaceId,
      model: configuredModel(),
      errorClass: errorClass(error),
      errorKind: errorKind(error),
    });
    return { error: messageFor(error) };
  }

  revalidatePath("/results");
  redirect("/results");
}

/**
 * Saves an edit to one pack post.
 *
 * Writes `payload_json` only. `original_payload` holds the model's own words and
 * is never overwritten, so edit-and-approve stays traceable (T3.9) — and the
 * first edit is what fills it, since a pack post is born without one.
 */
export async function savePackPostAction(
  _prev: PackState,
  formData: FormData,
): Promise<PackState> {
  const draftId = String(formData.get("draft_id") ?? "").trim();
  if (!draftId) return { error: "That post could not be identified." };

  const session = await getOpsSession();
  if (!session) return { error: "Your session expired. Sign in and try again." };
  if (!canWrite(session.activeWorkspace.role)) {
    return { error: "Viewers cannot edit a post." };
  }

  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from("content_drafts")
    .select("id, status, payload_json, original_payload")
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .eq("source", "growth_pack")
    .maybeSingle();

  if (readError) return { error: "That post could not be loaded." };
  if (!existing) return { error: "That post is not in this workspace." };
  // An approved or published post is a record of what a human signed off on.
  // Editing it in place would make that record a lie.
  if (existing.status === "approved" || existing.status === "published") {
    return { error: "That post has already been approved. Edits would change the approved text." };
  }

  const payload = {
    ...(existing.payload_json as Record<string, unknown>),
    hook: String(formData.get("hook") ?? "").slice(0, 2000),
    script: String(formData.get("script") ?? "").slice(0, 20000),
    cta: String(formData.get("cta") ?? "").slice(0, 500),
    // 006/007: each media field is only present on the platforms that accept
    // one, so an absent field must not wipe a URL saved earlier from a card
    // that did show it.
    ...(formData.has("image_url")
      ? { image_url: String(formData.get("image_url") ?? "").trim().slice(0, 2000) }
      : {}),
    ...(formData.has("video_url")
      ? { video_url: String(formData.get("video_url") ?? "").trim().slice(0, 2000) }
      : {}),
  };

  const topic = String(formData.get("topic") ?? "").trim().slice(0, 300);

  const { error: writeError } = await supabase
    .from("content_drafts")
    .update({
      payload_json: payload,
      ...(topic ? { topic } : {}),
      original_payload: existing.original_payload ?? existing.payload_json,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", draftId);

  if (writeError) return { error: "That edit could not be saved." };

  revalidatePath("/results");
  return {};
}
