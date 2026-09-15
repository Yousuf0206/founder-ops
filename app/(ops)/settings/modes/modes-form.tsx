"use client";

import { useActionState } from "react";

import { saveModesAction, type ModesState } from "./actions";

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

const MODES = [
  {
    value: "draft_only",
    label: "Draft only",
    help: "Nothing publishes. Approved drafts are copied out by hand.",
  },
  {
    value: "approve_then_publish",
    label: "Approve, then publish",
    help: "A person with approval rights publishes or schedules each approved draft.",
  },
  {
    value: "auto_within_rules",
    label: "Auto within rules",
    help: "Drafts that pass every rule below publish without a person. Claims and caps still apply.",
  },
] as const;

export type ModesFormValues = {
  publishMode: string;
  dailyPublishCap: number;
  timezone: string;
  autoEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  days: number[];
  minConfidence: number | null;
};

export function ModesForm({
  values,
  capCeiling,
  autoAllowed,
  plan,
}: {
  values: ModesFormValues;
  capCeiling: number;
  autoAllowed: boolean;
  plan: string;
}) {
  const [state, formAction] = useActionState<ModesState, FormData>(saveModesAction, {});

  return (
    <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Publish mode</legend>
        {MODES.map((mode) => {
          const locked = mode.value === "auto_within_rules" && !autoAllowed;
          return (
            <label
              key={mode.value}
              className={`flex gap-3 rounded-lg border border-line bg-surface p-3 text-sm ${locked ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="publish_mode"
                value={mode.value}
                defaultChecked={values.publishMode === mode.value}
                disabled={locked}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{mode.label}</span>
                <span className="mt-0.5 block text-muted">
                  {locked ? `Needs the team or business plan (this workspace is on ${plan}).` : mode.help}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="daily_publish_cap" className="text-sm font-medium">
          Daily publish cap
        </label>
        <p className="text-sm text-muted">
          All platforms together, in every mode. Resets at midnight UTC. Up to {capCeiling} on this plan.
        </p>
        <input
          id="daily_publish_cap"
          name="daily_publish_cap"
          type="number"
          min={1}
          max={capCeiling}
          defaultValue={values.dailyPublishCap}
          className="w-32 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="timezone" className="text-sm font-medium">
          Workspace timezone
        </label>
        <input
          id="timezone"
          name="timezone"
          defaultValue={values.timezone}
          placeholder="Asia/Karachi"
          className="w-64 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-medium">Auto rules</legend>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_enabled" defaultChecked={values.autoEnabled} disabled={!autoAllowed} />
          Master auto switch — off stops all auto publishing at once
        </label>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Publish between</span>
          <input
            type="time"
            name="auto_window_start"
            aria-label="Window start"
            defaultValue={values.windowStart.slice(0, 5)}
            className="rounded-md border border-line bg-surface px-2 py-1"
          />
          <span>and</span>
          <input
            type="time"
            name="auto_window_end"
            aria-label="Window end"
            defaultValue={values.windowEnd.slice(0, 5)}
            className="rounded-md border border-line bg-surface px-2 py-1"
          />
          <span className="text-muted">workspace time</span>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="checkbox" name="auto_days" value={value} defaultChecked={values.days.includes(value)} />
              {label}
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="auto_min_confidence" className="text-sm">
            Minimum idea confidence <span className="text-muted">(optional — blank turns the gate off)</span>
          </label>
          <input
            id="auto_min_confidence"
            name="auto_min_confidence"
            type="number"
            min={0}
            max={100}
            defaultValue={values.minConfidence ?? ""}
            placeholder="60"
            className="w-24 rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-muted">
          Only accounts switched to auto under Connected accounts are eligible. A draft with a
          forbidden claim is sent to a person instead, and every auto publish is recorded as
          approved by the rule.
        </p>
      </fieldset>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}

      <div>
        <button type="submit" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
          Save publishing controls
        </button>
      </div>
    </form>
  );
}
