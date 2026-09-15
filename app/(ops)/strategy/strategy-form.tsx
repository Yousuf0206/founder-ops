"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { runStrategyAction, type StrategyState } from "./actions";

type Option = { id: string; label: string };

export function StrategyForm({
  disabled,
  reports,
  analyses,
  defaultAnalysis,
}: {
  disabled?: string;
  reports: Option[];
  analyses: Option[];
  defaultAnalysis?: string;
}) {
  const [state, formAction] = useActionState<StrategyState, FormData>(runStrategyAction, {});

  if (disabled) {
    return (
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {disabled}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <SourceSelect name="research_report_id" label="Research report" options={reports} />
      <SourceSelect
        name="analyze_run_id"
        label="URL analysis"
        options={analyses}
        defaultValue={defaultAnalysis}
      />

      <p className="text-xs text-muted">
        Ideas are scored 0–100 on impact, effort, and confidence. An idea is saved only if its
        evidence quote is found in the source you chose.
      </p>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}

      <div>
        <Submit />
      </div>
    </form>
  );
}

function SourceSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label} <span className="font-normal text-muted">(optional)</span>
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
      >
        <option value="">None</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
      {pending ? "Scoring ideas… (up to 60s)" : "Generate ideas"}
    </button>
  );
}
