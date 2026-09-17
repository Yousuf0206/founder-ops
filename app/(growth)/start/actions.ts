"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { cookies } from "next/headers";

import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  getOpsSession,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  runGrowthAnalysis,
  NoUsableHurdlesError,
  ThinPageError,
  GROWTH_GOALS,
  type GrowthGoal,
} from "@/lib/growth/analyze";
import { resolveGrowthWorkspace, WorkspaceCreateFailedError } from "@/lib/growth/workspace";
import { FetchFailedError, RobotsDisallowedError, UnsafeUrlError } from "@/lib/analyze/fetch";
import { UnparseableOutputError } from "@/lib/ai/research";
import { CapReachedError, ProviderNotConfiguredError } from "@/lib/ai/run";
import { MissingClaimSetError } from "@/lib/prompts/assemble";
import { ProviderError } from "@/lib/ai/provider";

export type StartState = { error?: string };

/**
 * NFR-GI-004: every failure the user can act on gets its own sentence. A
 * generic "something went wrong" on the first screen of a first run is the
 * worst possible outcome, so the only catch-all is a genuine bug.
 */
function messageFor(error: unknown): string {
  if (
    error instanceof UnsafeUrlError ||
    error instanceof RobotsDisallowedError ||
    error instanceof FetchFailedError ||
    error instanceof ThinPageError ||
    error instanceof NoUsableHurdlesError ||
    error instanceof CapReachedError ||
    error instanceof ProviderNotConfiguredError ||
    error instanceof WorkspaceCreateFailedError
  ) {
    return error.message;
  }
  if (error instanceof MissingClaimSetError) {
    // Unreachable from Start: the analysis run is exempt from the claim gate
    // precisely because it is what seeds the facts (KnowledgeContext.allowUnbound).
    // If it fires, SC-02 has regressed — and the user must be told the truth about
    // it. This branch used to return "could not read enough from that page", which
    // sent every affected founder off to re-read a page that had in fact been read
    // perfectly well, and hid a first-run-blocking bug behind a content complaint.
    // Never describe a gate refusal as a fetch problem.
    console.error("SC-02 regression: claim gate refused a Growth Instant run", error);
    return (
      "We read your page, but something on our side blocked the analysis. That is a "  +
      "bug on our end, not a problem with your page — it has been logged. Try again."
    );
  }
  if (error instanceof UnparseableOutputError) {
    return "The analysis came back unreadable. The failed run was logged — try again.";
  }
  if (error instanceof ProviderError) {
    return "The AI provider did not respond. Try again in a moment.";
  }

  console.error(error);
  return "Something went wrong. Try again.";
}

function parseGoal(raw: FormDataEntryValue | null): GrowthGoal | null {
  const value = String(raw ?? "").trim();
  return (GROWTH_GOALS as readonly string[]).includes(value) ? (value as GrowthGoal) : null;
}

export async function startAnalysisAction(
  _prev: StartState,
  formData: FormData,
): Promise<StartState> {
  // `redirect()` signals by throwing, so every redirect happens AFTER the catch.
  // Calling it inside the try would let messageFor() swallow the signal and
  // report a generic failure instead of navigating.
  let signedOut = false;

  try {
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { error: "Enter your product's URL to get started." };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      signedOut = true;
    } else {
      // FR-GI-S-003: no setup form. Create or select underneath the user.
      const { workspaceId } = await resolveGrowthWorkspace(user.id, url);
      (await cookies()).set(
        ACTIVE_WORKSPACE_COOKIE,
        workspaceId,
        activeWorkspaceCookieOptions,
      );

      const session = await getOpsSession();
      if (!session) return { error: "Your session expired. Sign in and try again." };

      const goal = parseGoal(formData.get("goal"));
      await runGrowthAnalysis(session, {
        url,
        goal,
        // Only meaningful for "other"; ignoring it otherwise stops a stale
        // value from a changed dropdown reaching the prompt.
        goalNote: goal === "other" ? String(formData.get("goal_note") ?? "") : null,
      });
    }
  } catch (error) {
    return { error: messageFor(error) };
  }

  if (signedOut) redirect("/login?next=/start");

  revalidatePath("/hurdles");
  redirect("/hurdles");
}
