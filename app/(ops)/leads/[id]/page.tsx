import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/knowledge/repo";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StageForm } from "./stage-form";
import { canWrite } from "@/lib/auth/session";
import { addLeadTaskAction, toggleLeadTaskAction } from "../actions";

type Task = { id: string; note: string; done: boolean; created_at: string };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const workspaceId = session.activeWorkspace.workspaceId;
  const supabase = await createSupabaseServerClient();

  const [{ data: lead }, { data: tasks }] = await Promise.all([
    supabase.from("leads").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle(),
    supabase
      .from("lead_tasks")
      .select("id, note, done, created_at")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!lead) notFound();
  const writer = canWrite(session.activeWorkspace.role);

  return (
    <div className="max-w-2xl">
      <Link href="/leads" className="text-sm text-muted">
        ← Leads
      </Link>

      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {lead.name || lead.email}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {lead.email} · via {lead.source} ·{" "}
        {new Date(lead.created_at).toLocaleString()}
        {lead.seen_count > 1 && ` · seen ${lead.seen_count} times`}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-line bg-surface p-4 text-sm">
        <Cell label="Segment" value={lead.segment} />
        <Cell label="Intent" value={lead.intent} />
        <Cell label="Score" value={`${lead.score} / 100`} />
      </dl>

      {lead.rationale && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-medium text-ink">Why: </span>
          {lead.rationale}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium">Message</h2>
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm">
          {lead.message || <span className="text-muted">(empty)</span>}
        </p>
      </section>

      <p className="mt-4 text-xs text-muted">
        {lead.notified_at
          ? `Team notified ${new Date(lead.notified_at).toLocaleString()}. `
          : ""}
        No message has been sent to this person, and Lumo Grow cannot send one.
      </p>

      {/* 002 T4.2 / US9 AC4: tasks for a person to act on — the app never contacts the lead. */}
      <section className="mt-8">
        <h2 className="text-sm font-medium">Tasks</h2>
        {(tasks ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tasks.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {((tasks ?? []) as Task[]).map((task) => (
              <li key={task.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
                <span className={task.done ? "text-muted line-through" : ""}>{task.note}</span>
                {writer && (
                  <form action={toggleLeadTaskAction}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="done" value={task.done ? "false" : "true"} />
                    <button type="submit" className="shrink-0 text-xs underline">
                      {task.done ? "Reopen" : "Done"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {writer && (
          <form action={addLeadTaskAction} className="mt-3 flex gap-2">
            <input type="hidden" name="lead_id" value={lead.id} />
            <label htmlFor="note" className="sr-only">
              New task
            </label>
            <input
              id="note"
              name="note"
              required
              maxLength={2000}
              placeholder="Call back Thursday about the school plan"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
              Add task
            </button>
          </form>
        )}
      </section>

      {writer && <StageForm leadId={lead.id} stage={lead.stage} />}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
