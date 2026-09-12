"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  decideCampaignAction,
  runCampaignAction,
  type CampaignState,
} from "./actions";

export function CampaignForm({ disabled }: { disabled?: string }) {
  const [state, formAction] = useActionState<CampaignState, FormData>(
    runCampaignAction,
    {},
  );

  if (disabled) {
    return (
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {disabled}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal" className="text-sm font-medium">
          Goal
        </label>
        <textarea
          id="goal"
          name="goal"
          rows={3}
          required
          placeholder="Get 200 matric students onto the free tier before exam season"
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audience" className="text-sm font-medium">
          Audience <span className="font-normal text-[--color-muted]">(optional)</span>
        </label>
        <input
          id="audience"
          name="audience"
          placeholder="Parents in Lahore and Karachi"
          className="w-full rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <p className="text-xs text-[--color-muted]">
        Campaigns go through the same approval queue as content. The email draft is a draft —
        this system sends nothing.
      </p>

      <div>
        <Submit idle="Draft campaign" busy="Drafting… (up to 60s)" />
      </div>
    </form>
  );
}

export function CampaignDecision({
  campaignId,
  status,
}: {
  campaignId: string;
  status: string;
}) {
  const [state, formAction] = useActionState<CampaignState, FormData>(
    decideCampaignAction,
    {},
  );

  if (status !== "awaiting_approval" && status !== "draft") {
    return (
      <p className="mt-8 rounded-lg border border-[--color-line] bg-[--color-surface] p-4 text-sm text-[--color-muted]">
        This campaign has been decided.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-8 rounded-lg border border-[--color-line] bg-[--color-surface] p-4"
    >
      <input type="hidden" name="campaign_id" value={campaignId} />
      <h2 className="text-sm font-medium">Decision</h2>

      <textarea
        name="notes"
        rows={2}
        placeholder="Notes (optional)"
        className="mt-3 w-full rounded-md border border-[--color-line] px-3 py-2 text-sm"
      />

      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="mt-2 text-sm text-emerald-700">{state.done}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
        >
          Reject
        </button>
      </div>
    </form>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );
}
