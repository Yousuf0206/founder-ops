"use client";

import { useActionState } from "react";

import { saveSettingsAction, type SettingsState } from "./actions";

export function SettingsForm({
  cap,
  notifyEmail,
  used,
}: {
  cap: number;
  notifyEmail: string;
  used: number;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveSettingsAction,
    {},
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="daily_run_cap" className="text-sm font-medium">
          Daily AI run cap
        </label>
        <p className="text-sm text-[--color-muted]">
          Counts runs, not tokens. Resets at UTC midnight. {used} used today.
        </p>
        <input
          id="daily_run_cap"
          name="daily_run_cap"
          type="number"
          min={0}
          max={10000}
          defaultValue={cap}
          className="w-32 rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notify_email" className="text-sm font-medium">
          Notification email
        </label>
        <p className="text-sm text-[--color-muted]">
          Where high-intent lead alerts go. A team address — never a lead&rsquo;s.
        </p>
        <input
          id="notify_email"
          name="notify_email"
          type="email"
          defaultValue={notifyEmail}
          placeholder="owner@example.com"
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}

      <div>
        <button
          type="submit"
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
        >
          Save settings
        </button>
      </div>
    </form>
  );
}
