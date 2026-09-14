"use client";

import { useActionState } from "react";

import { rotateIngestSecretAction, type IngestSecretState } from "./actions";

export function IngestSecretForm({ hasSecret }: { hasSecret: boolean }) {
  const [state, action, pending] = useActionState<IngestSecretState, FormData>(
    rotateIngestSecretAction,
    {},
  );

  return (
    <div className="mt-3">
      {state.secret ? (
        <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-medium">Copy this secret now. It will not be shown again.</p>
          <code className="mt-2 block break-all text-xs">{state.secret}</code>
        </div>
      ) : (
        <form
          action={action}
          onSubmit={(event) => {
            if (hasSecret && !confirm("Replace the current secret? Apps using it will stop working.")) {
              event.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-60"
          >
            {pending ? "Generating…" : hasSecret ? "Replace secret" : "Generate secret"}
          </button>
        </form>
      )}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
