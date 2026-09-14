"use client";

import { useActionState } from "react";

import { createInvitationAction, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    createInvitationAction,
    {},
  );

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="invite-email" className="sr-only">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          className="min-w-0 flex-1 rounded-md border border-[--color-line] bg-[--color-surface] px-3 py-2 text-sm"
        />
        <label htmlFor="invite-role" className="sr-only">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="editor"
          className="rounded-md border border-[--color-line] bg-[--color-surface] px-2 py-2 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.done && <p className="text-sm text-green-700">{state.done}</p>}
    </form>
  );
}
