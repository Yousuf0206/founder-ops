"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { generateSummaryAction, type InsightsState } from "./actions";

export function SummaryForm({ disabled }: { disabled?: string }) {
  const [state, formAction] = useActionState<InsightsState, FormData>(generateSummaryAction, {});

  if (disabled) {
    return <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{disabled}</p>;
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <div>
        <Submit />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Reviewing posts… (up to 60s)" : "Summarise what worked"}
    </button>
  );
}
