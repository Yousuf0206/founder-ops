import "server-only";

import type { ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Posting to X (006 T-3).
 *
 * Import rule, enforced by scripts/check-publish-guards.mjs: only
 * lib/publish/execute.ts may import this module.
 *
 * One post, never a thread. A thread would mean several writes where the cap
 * reserved one, a receipt that names one id for several posts, and a half-sent
 * thread when the second call fails — three guarantees broken to save a founder
 * one copy-paste. If threads are wanted they get their own job type, not a loop
 * hidden inside this function.
 */

const TWEETS_URL = "https://api.x.com/2/tweets";

/** The standard post limit. Premium raises it; we hold everyone to the floor. */
export const X_POST_LIMIT = 280;

/**
 * The approved body as one post.
 *
 * Unlike LinkedIn and Meta, there is no room to append everything: hook, body,
 * CTA and hashtags together will almost always exceed 280. So the parts are
 * added in priority order and what does not fit is left out — except that
 * nothing is ever cut mid-word or mid-sentence, because a truncated sentence
 * is not the text a human approved.
 */
export function composeXPost(payload: ContentPayload): string {
  const hashtags = payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

  const parts = [payload.script.trim() || payload.hook.trim(), payload.cta.trim(), ...hashtags];

  let text = "";
  for (const part of parts) {
    if (!part) continue;
    const candidate = text ? `${text}\n\n${part}` : part;
    if (candidate.length <= X_POST_LIMIT) text = candidate;
  }

  return text;
}

export async function publishToX(
  input: { accessToken: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalId: string; permalink: string }> {
  const text = composeXPost(input.payload);

  if (!text) throw new ConnectorError("rejected", "The approved body is empty.");
  // Reachable only when the first part alone is over the limit: refuse rather
  // than post half a sentence.
  if (text.length > X_POST_LIMIT) {
    throw new ConnectorError(
      "rejected",
      `This post is ${text.length} characters and X allows ${X_POST_LIMIT}. Edit the draft and approve it again.`,
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(TWEETS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ConnectorError(
      "outcome_unknown",
      "The connection to X failed mid-request, so it is unknown whether the post went out. Check the profile before retrying.",
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    data?: { id?: string };
    detail?: string;
    title?: string;
    errors?: { message?: string }[];
  };

  if (response.status === 201 || (response.ok && body.data?.id)) {
    const externalId = body.data?.id;
    if (!externalId) {
      throw new ConnectorError(
        "outcome_unknown",
        "X accepted the post but returned no id. It is likely live — check the profile and do not retry.",
      );
    }
    return { externalId, permalink: `https://x.com/i/web/status/${externalId}` };
  }

  const detail = body.detail || body.errors?.[0]?.message || body.title || `HTTP ${response.status}`;

  if (response.status === 401) {
    throw new ConnectorError("token_revoked", `X rejected the token: ${detail}. Reconnect the account.`);
  }
  if (response.status === 403) {
    // The single most likely production failure here, and the one a generic
    // "refused" message would waste a day on: writes need a paid tier.
    throw new ConnectorError(
      "rejected",
      `X refused the post: ${detail}. Posting requires a paid X API tier — the free tier can connect but cannot publish.`,
    );
  }
  if (response.status === 429) {
    throw new ConnectorError("rate_limited", `X rate-limited the request: ${detail}. Nothing was posted.`);
  }
  if (response.status >= 500) {
    throw new ConnectorError("unavailable", `X returned ${response.status}: ${detail}`);
  }
  throw new ConnectorError("rejected", `X refused the post: ${detail}`);
}
