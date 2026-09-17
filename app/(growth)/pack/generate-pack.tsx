"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { generatePackAction, type PackState } from "./actions";

/**
 * The "Generate pack" control.
 *
 * It lives in the pack route because that is where the action does, but it is
 * rendered on Hurdles as well — the nav contract says generating a pack is an
 * ACTION on Hurdles, not a sixth destination (FR-GI-H-003, SC-06).
 */
export function GeneratePack({ label = "Generate growth pack" }: { label?: string }) {
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
        {pending ? "Writing your pack…" : label}
      </button>
      {pending && (
        <p className="text-sm text-muted">
          This usually takes under two minutes. Keep this tab open.
        </p>
      )}
    </>
  );
}
