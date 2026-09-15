import "server-only";

import type { ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * LinkedIn post creation (002 T2.4). Plain fetch against the Posts API — no SDK
 * (plan D4).
 *
 * Import rule, enforced by scripts/check-publish-guards.mjs: only
 * lib/publish/execute.ts may import this module, so no code can post to
 * LinkedIn without passing the claim check and cap reservation first.
 */

const POSTS_URL = "https://api.linkedin.com/rest/posts";

/** LinkedIn's documented commentary limit. */
export const LINKEDIN_COMMENTARY_LIMIT = 3000;

type Env = Record<string, string | undefined>;

/**
 * Commentary uses LinkedIn's "little text" format, where these characters are
 * markup. Escaping them posts the text exactly as approved — hashtags included,
 * as plain text.
 */
export function escapeLittleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, "\\$&");
}

/** The approved body, in reading order. Exactly what the claim check saw. */
export function composeCommentary(payload: ContentPayload): string {
  const hashtags = payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");

  return [payload.hook, payload.script, payload.cta, hashtags]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function publishToLinkedIn(
  input: { accessToken: string; memberId: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<{ externalId: string; permalink: string }> {
  const version = env.LINKEDIN_API_VERSION;
  if (!version || !/^\d{6}$/.test(version)) {
    throw new ConnectorError(
      "misconfigured",
      "LINKEDIN_API_VERSION must be set to an active LinkedIn API version (YYYYMM).",
    );
  }

  const commentary = composeCommentary(input.payload);
  if (!commentary) throw new ConnectorError("rejected", "The approved body is empty.");

  // Refuse rather than truncate: a cut body is not the body that was approved.
  if (commentary.length > LINKEDIN_COMMENTARY_LIMIT) {
    throw new ConnectorError(
      "rejected",
      `The post is ${commentary.length} characters; LinkedIn allows ${LINKEDIN_COMMENTARY_LIMIT}. Edit the draft and approve it again.`,
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(POSTS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        "linkedin-version": version,
        "x-restli-protocol-version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${input.memberId}`,
        commentary: escapeLittleText(commentary),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
  } catch {
    // The request may have reached LinkedIn before the connection failed.
    throw new ConnectorError(
      "outcome_unknown",
      "The connection to LinkedIn failed mid-request, so it is unknown whether the post went out. Check the profile before retrying.",
    );
  }

  if (response.status === 201) {
    const externalId = response.headers.get("x-restli-id");
    if (!externalId) {
      throw new ConnectorError(
        "outcome_unknown",
        "LinkedIn accepted the post but returned no post id. It is likely live — check the profile and do not retry.",
      );
    }
    return {
      externalId,
      permalink: `https://www.linkedin.com/feed/update/${encodeURIComponent(externalId)}/`,
    };
  }

  const detail = (await response.text().catch(() => "")).slice(0, 300);

  if (response.status === 401) {
    throw new ConnectorError("token_revoked", "LinkedIn rejected the token. Reconnect the account.");
  }
  if (response.status === 429) {
    throw new ConnectorError("rate_limited", "LinkedIn rate-limited the request. Nothing was posted.");
  }
  if (response.status >= 500) {
    throw new ConnectorError("unavailable", `LinkedIn returned ${response.status}. ${detail}`.trim());
  }
  throw new ConnectorError("rejected", `LinkedIn refused the post (${response.status}). ${detail}`.trim());
}
