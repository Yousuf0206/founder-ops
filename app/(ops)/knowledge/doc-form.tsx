"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ActionState } from "./actions";

type Doc = {
  id: string;
  title: string;
  body: string;
  category: string;
  last_verified_at: string | null;
};

/** Shared create/edit form (T1.3). */
export function DocForm({
  action,
  doc,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  doc?: Doc;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {doc && <input type="hidden" name="id" value={doc.id} />}
      {doc?.last_verified_at && (
        <input type="hidden" name="last_verified_at" value={doc.last_verified_at} />
      )}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={doc?.title ?? ""}
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Category" htmlFor="category">
        <input
          id="category"
          name="category"
          maxLength={60}
          defaultValue={doc?.category ?? "general"}
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Body" htmlFor="body">
        <textarea
          id="body"
          name="body"
          rows={16}
          defaultValue={doc?.body ?? ""}
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 font-mono text-sm"
        />
      </Field>

      {doc && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="mark_verified" />
          Mark as verified today
          {doc.last_verified_at && (
            <span className="text-xs text-[--color-muted]">
              (last verified {new Date(doc.last_verified_at).toLocaleDateString()})
            </span>
          )}
        </label>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
