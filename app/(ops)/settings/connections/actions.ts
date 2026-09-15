"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isOwner } from "@/lib/auth/session";
import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { writeAudit } from "@/lib/ai/run";
import { disconnectAccount } from "@/lib/publish/enqueue";

const accountSchema = z.object({ account_id: z.string().uuid() });

/** US2 AC5: disconnecting blocks anything still waiting to publish to the account. */
export async function disconnectAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!isOwner(session.activeWorkspace.role)) return;

  const parsed = accountSchema.safeParse({ account_id: formData.get("account_id") });
  if (!parsed.success) return;

  await disconnectAccount(parsed.data.account_id);

  revalidatePath("/settings/connections");
  revalidatePath("/publish");
}

const autoSchema = z.object({ account_id: z.string().uuid(), auto_enabled: z.enum(["true", "false"]) });

/**
 * Decisions §4: auto publishes only to accounts explicitly enabled for it.
 * Owner-only in the database too (RLS update policy + a one-column grant).
 */
export async function setAccountAutoAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  if (!isOwner(session.activeWorkspace.role)) return;

  const parsed = autoSchema.safeParse({
    account_id: formData.get("account_id"),
    auto_enabled: formData.get("auto_enabled"),
  });
  if (!parsed.success) return;

  const enabled = parsed.data.auto_enabled === "true";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connected_accounts")
    .update({ auto_enabled: enabled })
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.account_id)
    .select("id");

  if (!error && (data ?? []).length > 0) {
    await writeAudit(workspaceId, "connector.auto_enabled_changed", "connected_account", parsed.data.account_id, {
      auto_enabled: enabled,
    });
  }

  revalidatePath("/settings/connections");
}
