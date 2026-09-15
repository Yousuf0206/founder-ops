"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { publishDraftAction, type PublishState } from "../../publish/actions";

/**
 * Publish or schedule an approved draft to a connected account (002 US4 AC3–4).
 * The server re-checks everything: rights, account, mode, claims on the final
 * body, and the cap. This form only collects the choice.
 */
export function PublishPanel({
  draftId,
  accounts,
  mode,
}: {
  draftId: string;
  accounts: { id: string; display_name: string }[];
  mode: string;
}) {
  const [state, formAction] = useActionState<PublishState, FormData>(publishDraftAction, {});
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [localTime, setLocalTime] = useState("");

  if (mode === "draft_only") {
    return (
      <p className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        This workspace is in draft-only mode, so nothing publishes. An owner can change the mode.
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        Approved. Connect an account for this platform under Settings → Connected accounts to
        publish it from here.
      </p>
    );
  }

  // datetime-local is the viewer's local time; the server receives an absolute instant.
  const scheduledFor = localTime ? new Date(localTime).toISOString() : "";

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-medium">Publish</h2>
      <input type="hidden" name="draft_id" value={draftId} />
      <input type="hidden" name="scheduled_for" value={scheduledFor} />

      <label htmlFor="account_id" className="text-sm">
        Account
      </label>
      <select
        id="account_id"
        name="account_id"
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        defaultValue={accounts[0]!.id}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.display_name || "Connected account"}
          </option>
        ))}
      </select>

      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="sr-only">When</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} />
          Publish now
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="when"
            value="schedule"
            checked={when === "schedule"}
            onChange={() => setWhen("schedule")}
          />
          Schedule
        </label>
        {when === "schedule" && (
          <input
            type="datetime-local"
            aria-label="Publish at (your local time)"
            value={localTime}
            onChange={(event) => setLocalTime(event.target.value)}
            required
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
          />
        )}
      </fieldset>

      <p className="text-xs text-muted">
        The approved text is checked against forbidden claims and the daily cap again at the moment
        it posts.
      </p>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}

      <div>
        <Submit when={when} />
      </div>
    </form>
  );
}

function Submit({ when }: { when: "now" | "schedule" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Working…" : when === "now" ? "Publish now" : "Schedule"}
    </button>
  );
}
