"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { startAnalysisAction, type StartState } from "./actions";

/**
 * The Start screen form (T-A1; FR-GI-S-002).
 *
 * One required field. The goal is optional and must stay optional — a required
 * second field is the beginning of the setup form v3.0.0 deleted.
 */

const GOALS = [
  { value: "", label: "Not sure yet" },
  { value: "signups", label: "More signups" },
  { value: "awareness", label: "More awareness" },
  { value: "waitlist", label: "Grow a waitlist" },
  { value: "other", label: "Something else" },
] as const;

export function StartForm() {
  const [state, formAction] = useActionState<StartState, FormData>(startAnalysisAction, {});

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="url" className="text-sm font-medium">
          Your product&rsquo;s URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          autoFocus
          maxLength={2000}
          placeholder="https://yourproduct.com"
          className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base sm:text-sm"
        />
        <p className="text-sm text-muted">
          We read the page as any visitor would, and respect robots.txt.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal" className="text-sm font-medium">
          What are you after? <span className="font-normal text-muted">(optional)</span>
        </label>
        <select
          id="goal"
          name="goal"
          defaultValue=""
          className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base sm:text-sm"
        >
          {GOALS.map((goal) => (
            <option key={goal.value} value={goal.value}>
              {goal.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Reading your site…" : "Find my growth hurdles"}
      </button>
      {/* NFR-GI-001 is a <2 min budget; say so rather than letting it feel hung. */}
      {pending && (
        <p className="text-sm text-muted">
          This usually takes under two minutes. Keep this tab open.
        </p>
      )}
    </div>
  );
}
