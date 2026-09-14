"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  getOpsSession,
} from "@/lib/auth/session";

/** Switches the active workspace, but only to one the caller is a member of. */
export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const session = await getOpsSession();
  if (!session) redirect("/login");

  const target = String(formData.get("workspace_id") ?? "");
  if (session.memberships.some((m) => m.workspaceId === target)) {
    (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, target, activeWorkspaceCookieOptions);
  }

  redirect("/");
}
