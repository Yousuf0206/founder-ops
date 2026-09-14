"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ActionState } from "../actions";
import { saveClaimsAction } from "../actions";

export function ClaimsForm({
  approved,
  forbidden,
  brandVoice,
}: {
  approved: string[];
  forbidden: string[];
  brandVoice: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveClaimsAction, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      <section>
        <label htmlFor="approved_claims" className="text-sm font-medium">
          Approved claims
        </label>
        <p className="mt-1 text-sm text-muted">
          One claim per line. These are the things the bots are allowed to assert about the
          product. Anything not derivable from here or from a knowledge doc should come back as
          &ldquo;unknown&rdquo;.
        </p>
        <textarea
          id="approved_claims"
          name="approved_claims"
          rows={8}
          defaultValue={approved.join("\n")}
          className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
        />
      </section>

      <section>
        <label htmlFor="forbidden_claims" className="text-sm font-medium">
          Forbidden claims
        </label>
        <p className="mt-1 text-sm text-muted">
          One phrase per line. These are checked against generated output — a forbidden claim
          appearing in approved output is a defect, not a warning. Write them as matchable
          phrases rather than descriptions of the rule.
        </p>
        <textarea
          id="forbidden_claims"
          name="forbidden_claims"
          rows={8}
          defaultValue={forbidden.join("\n")}
          className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
        />
      </section>

      <section>
        <label htmlFor="brand_voice" className="text-sm font-medium">
          Brand voice
        </label>
        <p className="mt-1 text-sm text-muted">
          How the product should sound. Injected into every generation prompt alongside the
          claims.
        </p>
        <textarea
          id="brand_voice"
          name="brand_voice"
          rows={5}
          defaultValue={brandVoice}
          className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div>
        <Submit />
      </div>
    </form>
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
      {pending ? "Saving…" : "Save claim set"}
    </button>
  );
}
