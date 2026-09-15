"use client";

import { useActionState } from "react";

import { setStageAction, type StageState } from "../actions";

const STAGES = [
  "new",
  "classified",
  "reviewing",
  "contacted",
  "qualified",
  "archived",
] as const;

/**
 * Moves a lead through the team's own pipeline.
 *
 * "Contacted" records that a human reached out by some other means. Selecting
 * it sends nothing — Lumo-Ops has no path to a lead's inbox.
 */
export function StageForm({ leadId, stage }: { leadId: string; stage: string }) {
  const [state, formAction] = useActionState<StageState, FormData>(setStageAction, {});

  return (
    <form action={formAction} className="mt-8 border-t border-line pt-4">
      <input type="hidden" name="lead_id" value={leadId} />

      <label htmlFor="stage" className="text-sm font-medium">
        Stage
      </label>
      <div className="mt-2 flex items-center gap-2">
        <select
          id="stage"
          name="stage"
          defaultValue={stage}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        >
          {STAGES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-line px-3 py-2 text-sm"
        >
          Update
        </button>
      </div>

      <p className="mt-2 text-xs text-muted">
        Marking &ldquo;contacted&rdquo; records that a person reached out themselves. It sends
        nothing.
      </p>

      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="mt-2 text-sm text-emerald-700">{state.done}</p>}
    </form>
  );
}
