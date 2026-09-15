"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { runAnalyzeAction, type AnalyzeState } from "./actions";

export function AnalyzeForm({ disabled, defaultUrl }: { disabled?: string; defaultUrl?: string }) {
  const [state, formAction] = useActionState<AnalyzeState, FormData>(runAnalyzeAction, {});

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
        <label htmlFor="url" className="text-sm font-medium">
          Public page URL
        </label>
        <p className="text-sm text-muted">
          One page is fetched as a visitor would see it. Pages that robots.txt disallows are not
          fetched. What the page says is analysed, never treated as an approved claim.
        </p>
        <input
          id="url"
          name="url"
          type="url"
          required
          maxLength={2000}
          defaultValue={defaultUrl}
          placeholder="https://example.com"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
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
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Analysing… (up to 60s)" : "Analyse page"}
    </button>
  );
}
