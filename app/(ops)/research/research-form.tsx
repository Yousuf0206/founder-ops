"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { runResearchAction, type ResearchState } from "./actions";

export function ResearchForm({ disabled }: { disabled?: string }) {
  const [state, formAction] = useActionState<ResearchState, FormData>(
    runResearchAction,
    {},
  );

  if (disabled) {
    return (
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {disabled}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title <span className="font-normal text-[--color-muted]">(optional)</span>
        </label>
        <input
          id="title"
          name="title"
          maxLength={200}
          placeholder="Q3 competitor sweep"
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes
        </label>
        <p className="text-sm text-[--color-muted]">
          Paste raw customer feedback, support threads, or competitor notes. Findings come back
          labelled Fact, Inference, or Hypothesis. Nothing is sent anywhere.
        </p>
        <textarea
          id="notes"
          name="notes"
          rows={14}
          required
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 font-mono text-sm"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Analysing… (up to 60s)" : "Run research"}
    </button>
  );
}
