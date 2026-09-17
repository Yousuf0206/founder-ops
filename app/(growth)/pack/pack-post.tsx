"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { savePackPostAction, type PackState } from "./actions";

/**
 * One editable post in the pack.
 *
 * Editing is inline and per post rather than one form for the whole pack: a
 * founder fixes one line in one post, and a single giant form would make them
 * re-submit five they had not touched, with every draft's version bumped.
 */

export type PackPostView = {
  id: string;
  topic: string;
  platform: string;
  status: string;
  hook: string;
  script: string;
  cta: string;
  hashtags: string[];
  angle: string;
  publishable: boolean;
  edited: boolean;
};

export function PackPost({ post }: { post: PackPostView }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<PackState, FormData>(savePackPostAction, {});

  const locked = post.status === "approved" || post.status === "published";

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide">
            {post.platform}
          </span>
          {!post.publishable && (
            /* The Meta gate, stated where it matters rather than discovered at
               the publish step. lib/connectors/registry.ts is what decides it. */
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              Draft only — copy it out by hand until Instagram publishing is live
            </span>
          )}
          {post.edited && <span className="text-xs text-muted">edited</span>}
          {locked && <span className="text-xs text-muted">{post.status}</span>}
        </div>

        {!locked && (
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="text-sm underline"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold">{post.topic}</h3>
      {post.angle && <p className="mt-1 text-xs text-muted">Angle: {post.angle}</p>}

      {editing ? (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="draft_id" value={post.id} />

          <Field label="Topic" name="topic" defaultValue={post.topic} maxLength={300} />
          <Field label="Hook" name="hook" defaultValue={post.hook} maxLength={2000} />

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Post</span>
            <textarea
              name="script"
              defaultValue={post.script}
              rows={8}
              maxLength={20000}
              className="w-full rounded-md border border-line bg-ground px-3 py-2 text-base sm:text-sm"
            />
          </label>

          <Field label="Call to action" name="cta" defaultValue={post.cta} maxLength={500} />

          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}

          <Save onSaved={() => setEditing(false)} />
        </form>
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {post.hook && <p className="font-medium">{post.hook}</p>}
          {post.script && <p className="whitespace-pre-wrap">{post.script}</p>}
          {post.cta && (
            <p>
              <span className="font-medium">CTA: </span>
              {post.cta}
            </p>
          )}
          {post.hashtags.length > 0 && (
            <p className="text-muted">{post.hashtags.join(" ")}</p>
          )}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  name,
  defaultValue,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue: string;
  maxLength: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="w-full rounded-md border border-line bg-ground px-3 py-2 text-base sm:text-sm"
      />
    </label>
  );
}

function Save({ onSaved }: { onSaved: () => void }) {
  const { pending } = useFormStatus();

  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        onClick={() => {
          // Close on the way out rather than on the result: the action
          // revalidates, so the saved text is what re-renders underneath.
          if (!pending) setTimeout(onSaved, 0);
        }}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
