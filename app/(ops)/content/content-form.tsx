"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { runContentAction, type ContentState } from "./actions";

export function ContentForm({ disabled }: { disabled?: string }) {
  const [state, formAction] = useActionState<ContentState, FormData>(runContentAction, {});

  if (disabled) {
    return (
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {disabled}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label="Topic" name="topic" required placeholder="Why spaced repetition works" />
      <Field label="Platform" name="platform" required placeholder="Instagram Reels" />
      <Field label="Audience" name="audience" placeholder="Parents of matric students" />
      <Field label="Tone" name="tone" placeholder="Warm, plain, no hype" />
      <Field label="Length" name="length_hint" placeholder="45 seconds" />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <p className="text-xs text-muted">
        Drafts land in the approvals queue. Nothing is published by this system.
      </p>

      <div>
        <Submit />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
      />
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
      {pending ? "Drafting… (up to 60s)" : "Draft content"}
    </button>
  );
}
