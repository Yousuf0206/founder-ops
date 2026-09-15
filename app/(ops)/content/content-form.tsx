"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/content/platforms";
import { runContentAction, type ContentState } from "./actions";

export function ContentForm({
  disabled,
  idea,
}: {
  disabled?: string;
  idea?: { id: string; title: string };
}) {
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
      {idea && (
        <p className="rounded-lg border border-line bg-surface p-3 text-sm">
          <span className="text-muted">From campaign idea: </span>
          <span className="font-medium">{idea.title}</span>
          <input type="hidden" name="strategy_idea_id" value={idea.id} />
        </p>
      )}

      <Field
        label="Topic"
        name="topic"
        required
        defaultValue={idea?.title}
        placeholder="Why spaced repetition works"
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Platforms</legend>
        <p className="text-sm text-muted">
          Each platform gets its own native draft — length, tone, and format — not one text reused.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
          {SOCIAL_PLATFORMS.map((platform) => (
            <label key={platform} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="platforms" value={platform} defaultChecked />
              {PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Audience" name="audience" placeholder="Parents of matric students" />
      <Field label="Tone" name="tone" placeholder="Warm, plain, no hype" />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <p className="text-xs text-muted">
        Drafts land in the approvals queue. Nothing is published until a draft is approved and
        published to a connected account.
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
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
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
      {pending ? "Drafting… (up to 60s)" : "Draft assets"}
    </button>
  );
}
