import "server-only";

import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Remembers which workspace a user last switched to. Only a preference: the
 * value is honored only if it matches a membership read through RLS below.
 */
export const ACTIVE_WORKSPACE_COOKIE = "founder-ops-workspace";

export const activeWorkspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export type MembershipRole = "owner" | "editor" | "viewer";

export type Membership = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: MembershipRole;
};

export type OpsSession = {
  userId: string;
  email: string;
  memberships: Membership[];
  activeWorkspace: Membership;
};

/**
 * Resolves the signed-in user and the workspaces they belong to.
 *
 * Returns null when there is no session, or when the user has a session but no
 * membership anywhere — the two cases the ops layout gate must reject (T0.7).
 *
 * Note this reads through RLS, so the membership list is itself proof of
 * access rather than a claim the app makes on the user's behalf.
 */
export async function getOpsSession(): Promise<OpsSession | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("role, workspaces (id, name, slug)")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const memberships: Membership[] = (data ?? [])
    .flatMap((row) => {
      const workspace = row.workspaces as unknown as
        | { id: string; name: string; slug: string }
        | null;
      if (!workspace) return [];
      return [
        {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          role: row.role as MembershipRole,
        },
      ];
    });

  const preferred = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const activeWorkspace =
    memberships.find((m) => m.workspaceId === preferred) ?? memberships[0];
  if (!activeWorkspace) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    memberships,
    activeWorkspace,
  };
}

/** True when the role may create or edit drafts and knowledge. */
export function canWrite(role: MembershipRole): boolean {
  return role === "owner" || role === "editor";
}

/** True when the role may change workspace settings and membership. */
export function isOwner(role: MembershipRole): boolean {
  return role === "owner";
}
