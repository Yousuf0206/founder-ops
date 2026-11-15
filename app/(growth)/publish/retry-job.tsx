"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { retryPublishAction, type InstantPublishState } from "./actions";

/**
 * Retry a failed or blocked attempt.
 *
 * The same job is retried rather than a new one created, which is what makes a
 * retry safe: a post that actually reached the platform is reconciled against
 * its stored receipt instead of sent twice (FR-08).
 */
export function RetryJob({ jobId }: { jobId: string }) {
  const [state, action] = useActionState<InstantPublishState, FormData>(retryPublishAction, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <RetryButton />
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
      {state.done && <span className="text-xs text-green-700">{state.done}</span>}
    </form>
  );
}

function RetryButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-60">
      {pending ? "Retrying…" : "Try again"}
    </button>
  );
}
