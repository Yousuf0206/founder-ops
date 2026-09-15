"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { decideAction, type DecisionState } from "../../approvals/actions";
import type { ContentPayload } from "@/lib/ai/content";

/**
 * The human gate (FR-A-002): approve, edit and approve, or reject.
 *
 * v1's "I published this manually" mark is gone (002 T2.13). Publishing is a
 * real action now, taken from the publish panel, and `published` is set only
 * by a publish job that holds a platform receipt.
 */
export function DecisionPanel({
  draftId,
  payload,
  status,
}: {
  draftId: string;
  payload: ContentPayload;
  status: string;
}) {
  const [state, formAction] = useActionState<DecisionState, FormData>(decideAction, {});
  const [editing, setEditing] = useState(false);

  const pendingDecision = status === "awaiting_approval" || status === "draft";

  if (!pendingDecision) {
    return (
      <div className="mt-8 rounded-lg border border-line bg-surface p-4">
        <p className="text-sm text-muted">
          {status === "approved"
            ? "Approved. Publish it below to a connected account, or copy it if this platform has no connector yet."
            : "This draft has been decided. Its history is below."}
        </p>
        {state.done && <p className="mt-2 text-sm text-emerald-700">{state.done}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-medium">Decision</h2>

      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="draft_id" value={draftId} />

        <label htmlFor="notes" className="text-sm">
          Notes <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />

        {editing && <EditFields payload={payload} />}

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.done && <p className="text-sm text-emerald-700">{state.done}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <SubmitButton name="decision" value="approved" className="bg-accent text-white">
                Approve
              </SubmitButton>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                Edit and approve
              </button>
              <SubmitButton name="decision" value="rejected" className="border border-red-200 text-red-700">
                Reject
              </SubmitButton>
            </>
          ) : (
            <>
              <SubmitButton
                name="decision"
                value="edited_and_approved"
                className="bg-accent text-white"
              >
                Save edits and approve
              </SubmitButton>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {editing && (
          <p className="text-xs text-muted">
            The model&rsquo;s original wording is kept alongside your edit, so the audit trail
            shows both.
          </p>
        )}
      </form>
    </div>
  );
}

function EditFields({ payload }: { payload: ContentPayload }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <Text name="hook" label="Hook" defaultValue={payload.hook} rows={2} />
      <Text name="script" label="Script" defaultValue={payload.script} rows={8} />
      <Text name="captions" label="Captions (one per line)" defaultValue={payload.captions.join("\n")} rows={3} />
      <Text name="titles" label="Titles (one per line)" defaultValue={payload.titles.join("\n")} rows={3} />
      <Text name="hashtags" label="Hashtags (one per line)" defaultValue={payload.hashtags.join("\n")} rows={3} />
      <Text name="cta" label="Call to action" defaultValue={payload.cta} rows={2} />
      <Text name="visual_plan" label="Visual plan" defaultValue={payload.visual_plan} rows={5} />
    </div>
  );
}

function Text({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
      />
    </div>
  );
}

function SubmitButton({
  children,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${className ?? ""}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
