"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isOwner } from "@/lib/auth/session";
import { AuthError, requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { writeAudit } from "@/lib/ai/run";
import { canUseAutoMode, planTierSchema, publishCapCeiling, publishModeSchema } from "@/lib/plans/entitlements";

export type ModesState = { error?: string; done?: string };

const clock = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a 24-hour time, like 09:00.");

const modesSchema = z
  .object({
    publish_mode: publishModeSchema,
    daily_publish_cap: z.coerce.number().int().min(1, "The daily publish cap must be at least 1."),
    timezone: z.string().trim().min(1, "Enter a timezone, like Asia/Karachi.").max(64),
    auto_enabled: z.boolean(),
    auto_window_start: clock,
    auto_window_end: clock,
    auto_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one day."),
    auto_min_confidence: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]),
  })
  .refine((v) => v.auto_window_start < v.auto_window_end, {
    message: "The window must end after it starts.",
    path: ["auto_window_end"],
  });

/**
 * 002 T3.1–T3.2, T3.5: owner-only publish controls (decisions §4, Safety level
 * High). The database re-enforces every rule here — plan gate on auto, cap
 * ceiling, valid timezone — whoever writes the row.
 */
export async function saveModesAction(_prev: ModesState, formData: FormData): Promise<ModesState> {
  try {
    const session = await requireSession();
    const workspaceId = session.activeWorkspace.workspaceId;
    if (!isOwner(session.activeWorkspace.role)) {
      return { error: "Only an owner can change publishing controls." };
    }

    const parsed = modesSchema.safeParse({
      publish_mode: formData.get("publish_mode"),
      daily_publish_cap: formData.get("daily_publish_cap"),
      timezone: formData.get("timezone"),
      auto_enabled: formData.get("auto_enabled") === "on",
      auto_window_start: formData.get("auto_window_start"),
      auto_window_end: formData.get("auto_window_end"),
      auto_days: formData.getAll("auto_days"),
      auto_min_confidence: formData.get("auto_min_confidence") ?? "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

    const supabase = await createSupabaseServerClient();
    const { data: current } = await supabase
      .from("workspaces")
      .select("plan, publish_mode")
      .eq("id", workspaceId)
      .single();

    const plan = planTierSchema.parse(current?.plan ?? "solo");
    const input = parsed.data;

    if (input.publish_mode === "auto_within_rules" && !canUseAutoMode(plan)) {
      return { error: `Auto publishing needs the team or business plan. This workspace is on ${plan}.` };
    }
    if (input.daily_publish_cap > publishCapCeiling(plan)) {
      return { error: `The ${plan} plan allows at most ${publishCapCeiling(plan)} publishes a day.` };
    }

    const { error } = await supabase
      .from("workspaces")
      .update({
        publish_mode: input.publish_mode,
        daily_publish_cap: input.daily_publish_cap,
        timezone: input.timezone,
        auto_enabled: input.auto_enabled,
        auto_window_start: input.auto_window_start,
        auto_window_end: input.auto_window_end,
        auto_days: [...new Set(input.auto_days)].sort(),
        auto_min_confidence: input.auto_min_confidence === "" ? null : input.auto_min_confidence,
      })
      .eq("id", workspaceId);

    if (error) {
      // The trigger's messages say exactly what is wrong (timezone, plan, ceiling).
      if (/timezone|plan|cap|window|days/i.test(error.message)) return { error: error.message };
      throw error;
    }

    await writeAudit(workspaceId, "settings.publish_controls_changed", "workspace", workspaceId, {
      from_mode: current?.publish_mode,
      to_mode: input.publish_mode,
      daily_publish_cap: input.daily_publish_cap,
      auto_enabled: input.auto_enabled,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error(error);
    return { error: "Something went wrong. Try again." };
  }

  revalidatePath("/settings/modes");
  revalidatePath("/publish");
  return { done: "Publishing controls saved." };
}
