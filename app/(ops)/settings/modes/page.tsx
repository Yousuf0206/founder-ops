import Link from "next/link";

import { isOwner } from "@/lib/auth/session";
import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { canUseAutoMode, planTierSchema, publishCapCeiling } from "@/lib/plans/entitlements";
import { ModesForm } from "./modes-form";

export default async function ModesPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const owner = isOwner(session.activeWorkspace.role);
  const supabase = await createSupabaseServerClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "plan, publish_mode, daily_publish_cap, timezone, auto_enabled, auto_window_start, auto_window_end, auto_days, auto_min_confidence",
    )
    .eq("id", workspaceId)
    .single();

  const plan = planTierSchema.parse(workspace?.plan ?? "solo");

  return (
    <div className="max-w-3xl">
      <Link href="/settings" className="text-sm text-muted">
        ← Settings
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Publishing controls</h1>
      <p className="mt-1 text-sm text-muted">
        One mode for the whole workspace, always visible where publishing happens. Plan:{" "}
        <span className="font-medium text-ink">{plan}</span>.
      </p>

      {owner && workspace ? (
        <ModesForm
          plan={plan}
          capCeiling={publishCapCeiling(plan)}
          autoAllowed={canUseAutoMode(plan)}
          values={{
            publishMode: workspace.publish_mode,
            dailyPublishCap: workspace.daily_publish_cap,
            timezone: workspace.timezone,
            autoEnabled: workspace.auto_enabled,
            windowStart: workspace.auto_window_start,
            windowEnd: workspace.auto_window_end,
            days: workspace.auto_days,
            minConfidence: workspace.auto_min_confidence,
          }}
        />
      ) : (
        <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          <Row label="Mode">{workspace?.publish_mode?.replace(/_/g, " ")}</Row>
          <Row label="Daily cap">{workspace?.daily_publish_cap}</Row>
          <Row label="Timezone">{workspace?.timezone}</Row>
          <Row label="Auto switch">{workspace?.auto_enabled ? "on" : "off"}</Row>
          <p className="px-4 py-3 text-muted">Only an owner can change publishing controls.</p>
        </dl>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
