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
    // After T-A7 this should be unreachable from Start: extraction seeds the
    // facts that bind the prompt. If it fires, SC-02 has regressed.
    console.error("SC-02 regression: claim gate refused a Growth Instant run", error);
    return "We could not read enough from that page to work with. Try your home page.";
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

      await runGrowthAnalysis(session, { url, goal: parseGoal(formData.get("goal")) });
    }
  } catch (error) {
    return { error: messageFor(error) };
  }

  if (signedOut) redirect("/login?next=/start");

  revalidatePath("/hurdles");
  redirect("/hurdles");
}
