import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Audit viewer (T5.5). Constitution VII made legible: every AI run and every
 * approval, in one list, readable by any member and editable by nobody.
 */
export default async function AuditPage() {
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [{ data: audits }, { data: runs }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, action, target_type, target_id, meta, created_at, profiles:actor (email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ai_run_logs")
      .select("id, action, status, model, prompt_tokens, output_tokens, error, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Audit</h1>
      <p className="mt-1 text-sm text-muted">
        Append-only. Written by the database, not by the app, so an actor cannot edit their
        own trail.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Actions</h2>
        {(audits ?? []).length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
            {(audits ?? []).map((entry) => {
              const actor = entry.profiles as unknown as { email: string } | null;
              return (
                <li key={entry.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span className="min-w-0">
                    <code className="text-xs">{entry.action}</code>
                    {entry.target_type && (
                      <span className="ml-2 text-xs text-muted">
                        {entry.target_type}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {actor?.email ?? "system"} · {new Date(entry.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">AI runs</h2>
        {(runs ?? []).length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-sm text-muted">
            No runs yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface text-sm">
            {(runs ?? []).map((run) => (
              <li key={run.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span>
                    <code className="text-xs">{run.action}</code>
                    <span
                      className={`ml-2 text-xs ${
                        run.status === "failed" || run.status === "refused"
                          ? "text-red-600"
                          : "text-muted"
                      }`}
                    >
                      {run.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {run.prompt_tokens !== null &&
                      `${run.prompt_tokens}+${run.output_tokens ?? 0} tok · `}
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
