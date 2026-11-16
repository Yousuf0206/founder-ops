"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  approvePostAction,
  publishPostAction,
  type InstantPublishState,
} from "./actions";

/**
 * One post on the Instant Publish screen.
 *
 * Two buttons at most, and only ever the one that is next: approve, then
 * publish. A founder should not have to understand draft statuses to get a post
 * out, so the status is spelled as a sentence and the action is whatever the
 * post is waiting for.
 */

export type PublishPostView = {
  id: string;
  topic: string;
  platform: string;
  status: string;
  body: string;
  publishable: boolean;
  /**
   * Why this post cannot be published yet, when the reason is media its
   * platform requires and the post does not have (007). Null when the post is
   * fine. The sentence comes from the registry, so the screen and the
   * connector's refusal say the same words.
   */
  mediaReason: string | null;
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function PublishPost({
  post,
  accountId,
  accountName,
}: {
  post: PublishPostView;
  /** The connected account to publish to, or null when none is connected yet. */
  accountId: string | null;
  accountName: string | null;
}) {
  const [approveState, approve] = useActionState<InstantPublishState, FormData>(
    approvePostAction,
    {},
  );
  const [publishState, publish] = useActionState<InstantPublishState, FormData>(
    publishPostAction,
    {},
  );

  const state = publishState.error || publishState.done ? publishState : approveState;
  const awaitingApproval = post.status === "awaiting_approval" || post.status === "draft";
  const approved = post.status === "approved";
  // A post missing the media its platform requires is certain to be refused,
  // so it is not offered an Approve or a Publish button at all (007).
  const ready = post.publishable && !post.mediaReason;

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide">
          {post.platform}
        </span>
        {!post.publishable && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
            Draft only until {post.platform} publishing is live
          </span>
        )}
        {post.publishable && post.mediaReason && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
            Needs media before it can be sent
          </span>
        )}
      </div>

      <p className="mt-3 text-sm font-medium">{post.topic}</p>
      <p className="mt-2 whitespace-pre-line text-sm text-muted">{post.body}</p>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.done && <p className="mt-3 text-sm text-green-700">{state.done}</p>}

      {post.publishable && post.mediaReason && (
        <p className="mt-3 rounded-md border border-line bg-ground p-3 text-sm text-muted">
          {post.mediaReason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {awaitingApproval && ready && (
          <form action={approve}>
            <input type="hidden" name="draft_id" value={post.id} />
            <Submit label="Approve" pendingLabel="Approving…" />
          </form>
        )}

        {approved && ready && accountId && (
          <form action={publish}>
            <input type="hidden" name="draft_id" value={post.id} />
            <input type="hidden" name="account_id" value={accountId} />
            <Submit
              label={accountName ? `Publish to ${accountName}` : "Publish"}
              pendingLabel="Publishing…"
            />
          </form>
        )}

        {approved && ready && !accountId && (
          <p className="text-sm text-muted">Approved. Connect a channel above to send it.</p>
        )}

        {post.status === "published" && <p className="text-sm text-muted">Published.</p>}

        {awaitingApproval && !post.publishable && (
          <p className="text-sm text-muted">
            Edit it on Results and copy it out by hand — nothing here can post it yet.
          </p>
        )}

        {awaitingApproval && post.publishable && post.mediaReason && (
          <a href="/results" className="text-sm underline">
            Add it on Results
          </a>
        )}
      </div>
    </li>
  );
}
