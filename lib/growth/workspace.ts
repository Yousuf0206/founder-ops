import "server-only";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/db/server";
import { defaultPlan } from "@/lib/plans/entitlements";

/**
 * Silent workspace create-or-select (T-A1/T-A2; FR-GI-S-003).
 *
 * v2 sent a new user to /onboarding to fill in a name, slug, niche, goals, and
 * tone before seeing anything. v3.0.0 UX Principle 4 removes that: the first run
 * is a URL and nothing else, so the workspace is created underneath the user.
 *
 * SELECT rule (plan.md open decision 3 — provisional): a user who already has a
 * membership reuses their most recent workspace rather than accumulating one per
 * URL. This is the conservative half of the decision — it never creates a second
 * workspace silently, so nothing has to be merged or cleaned up if the rule
 * changes to per-URL later. A user who wants separate workspaces can still make
 * them at /onboarding.
 */

/** Slug from the URL host: "https://Lumo-Learn.com/x" → "lumo-learn-com". */
export function slugFromUrl(raw: string, salt: string): string {
  let host = "";
  try {
    host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
  } catch {
    host = "";
  }

  const base = host
    .replace(/^www\./i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  // Slugs are globally unique (0008). Someone else may already own this host's
  // slug, so a short salt keeps silent creation from colliding with a stranger.
  return `${base || "workspace"}-${salt.slice(0, 6)}`;
}

/** Display name from the URL host: "https://lumo-learn.com" → "lumo-learn.com". */
export function nameFromUrl(raw: string): string {
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(
      /^www\./i,
      "",
    );
  } catch {
    return "My workspace";
  }
}

export class WorkspaceCreateFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceCreateFailedError";
  }
}

/**
 * Returns the workspace id the Start submission should run in, creating one if
 * the signed-in user has no membership yet.
 */
export async function resolveGrowthWorkspace(
  userId: string,
  url: string,
): Promise<{ workspaceId: string; created: boolean }> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from("memberships")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return { workspaceId: existing.workspace_id as string, created: false };

  const admin = createSupabaseAdminClient();
  const { data: workspaceId, error } = await admin.rpc("create_workspace_with_owner", {
    p_owner: userId,
    p_name: nameFromUrl(url),
    p_slug: slugFromUrl(url, userId.replace(/-/g, "")),
    p_plan: defaultPlan(),
    p_niche: "",
    p_primary_url: url,
    p_goals: "",
    p_tone: "",
  });

  if (error || !workspaceId) {
    if (error?.message && /workspace limit reached/i.test(error.message)) {
      throw new WorkspaceCreateFailedError(
        "You have reached your plan's workspace limit. Open Advanced to pick one.",
      );
    }
    console.error(error);
    throw new WorkspaceCreateFailedError(
      "Could not set up a workspace for you. Try again.",
    );
  }

  return { workspaceId: workspaceId as string, created: true };
}
