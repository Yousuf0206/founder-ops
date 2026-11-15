"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { generatePackAction, type PackState } from "./actions";

/**
 * The "Generate pack" control.
 *
 * It lives in the results route because that is where the action does, and it
 * is rendered inside both Results panels — generating is an ACTION on Results,
 * never a destination of its own (constitution R2, FR-GI-H-003).
 */
export function GeneratePack({ label = "Write my posts" }: { label?: string }) {
  const [state, formAction] = useActionState<PackState, FormData>(generatePackAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Submit label={label} />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Writing your posts…" : label}
      </button>
      {pending && (
        <p className="text-sm text-muted">
          This usually takes under two minutes. Keep this tab open.
        </p>
      )}
    </>
  );
}
