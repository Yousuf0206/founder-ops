import "server-only";

import type { ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Facebook Page and Instagram publishing (006 T-2).
 *
 * Import rule, enforced by scripts/check-publish-guards.mjs: only
 * lib/publish/execute.ts may import this module, so nothing can post to Meta
 * without passing the claim check and the cap reservation first.
 *
 * The two platforms are nothing alike underneath:
 *
 *   Facebook   one POST to /{page-id}/feed with the body as `message`.
 *   Instagram  TWO calls — a media container, then a publish — and the
 *              container REQUIRES media. The Instagram Content Publishing API
 *              has no caption-only post; there is no endpoint for one. So an
 *              Instagram post without an image cannot be published by any
 *              amount of code, and this refuses it with a sentence that says
 *              what to do instead of a platform error nobody can act on.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Facebook's practical limit for a feed message. */
export const FACEBOOK_MESSAGE_LIMIT = 63_206;
/** Instagram's documented caption limit. */
export const INSTAGRAM_CAPTION_LIMIT = 2_200;

/** The approved body, in reading order — exactly what the claim check saw. */
export function composeMetaBody(payload: ContentPayload): string {
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

type GraphBody = {
  id?: string;
  post_id?: string;
  permalink?: string;
  error?: { message?: string; code?: number; error_user_msg?: string };
};

async function post(
  url: string,
  params: URLSearchParams,
  fetchImpl: typeof fetch,
  what: string,
): Promise<GraphBody> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    // The request may have reached Meta before the connection broke.
    throw new ConnectorError(
      "outcome_unknown",
      `The connection to Meta failed while trying to ${what}, so it is unknown whether anything was posted. Check the account before retrying.`,
    );
  }

  const body = (await response.json().catch(() => ({}))) as GraphBody;

  if (response.ok && !body.error) return body;

  const detail = body.error?.error_user_msg || body.error?.message || `HTTP ${response.status}`;

  // 190 is Meta's catch-all for a dead token; 102 a dead session.
  if (response.status === 401 || body.error?.code === 190 || body.error?.code === 102) {
    throw new ConnectorError("token_revoked", `Meta rejected the token: ${detail}. Reconnect the account.`);
  }
  if (response.status === 429 || body.error?.code === 4 || body.error?.code === 32) {
    throw new ConnectorError("rate_limited", `Meta rate-limited the request: ${detail}. Nothing was posted.`);
  }
  if (response.status >= 500) {
    throw new ConnectorError("unavailable", `Meta returned ${response.status}: ${detail}`);
  }
  throw new ConnectorError("rejected", `Meta refused to ${what}: ${detail}`);
}

export async function publishToFacebookPage(
  input: { accessToken: string; pageId: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalId: string; permalink: string }> {
  const message = composeMetaBody(input.payload);
  if (!message) throw new ConnectorError("rejected", "The approved body is empty.");
  if (message.length > FACEBOOK_MESSAGE_LIMIT) {
    throw new ConnectorError(
      "rejected",
      `The post is ${message.length} characters; Facebook allows ${FACEBOOK_MESSAGE_LIMIT}.`,
    );
  }

  const params = new URLSearchParams({ message, access_token: input.accessToken });
  // An image is optional on Facebook: with one the post becomes a photo post,
  // without one it is a text post. Both carry the approved words unchanged.
  const image = input.payload.image_url.trim();
  const body = await post(
    image ? `${GRAPH_URL}/${input.pageId}/photos` : `${GRAPH_URL}/${input.pageId}/feed`,
    image ? new URLSearchParams({ url: image, caption: message, access_token: input.accessToken }) : params,
    fetchImpl,
    "create the post",
  );

  // /photos answers with the photo id AND the post id; /feed with the post id.
  const externalId = body.post_id ?? body.id;
  if (!externalId) {
    throw new ConnectorError(
      "outcome_unknown",
      "Meta accepted the post but returned no id. It is probably live — check the Page and do not retry.",
    );
  }

  return { externalId, permalink: `https://www.facebook.com/${externalId}` };
}

/**
 * Thrown when an Instagram post has no image. Its own class because this is
 * the one publish refusal a founder can fix in the post itself, and the UI
 * says so before they ever press publish.
 */
export class InstagramMediaRequiredError extends ConnectorError {
  constructor() {
    super(
      "rejected",
      "Instagram cannot publish a caption on its own — every post needs an image. Add an image URL to this post, or copy the caption and post it from your phone.",
    );
    this.name = "InstagramMediaRequiredError";
  }
}

export async function publishToInstagram(
  input: { accessToken: string; igUserId: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalId: string; permalink: string }> {
  const caption = composeMetaBody(input.payload);
  if (!caption) throw new ConnectorError("rejected", "The approved body is empty.");
  if (caption.length > INSTAGRAM_CAPTION_LIMIT) {
    throw new ConnectorError(
      "rejected",
      `The caption is ${caption.length} characters; Instagram allows ${INSTAGRAM_CAPTION_LIMIT}. Edit the draft and approve it again.`,
    );
  }

  const imageUrl = input.payload.image_url.trim();
  if (!imageUrl) throw new InstagramMediaRequiredError();

  // 1. The container. Meta fetches the image itself, so the URL must be public.
  const container = await post(
    `${GRAPH_URL}/${input.igUserId}/media`,
    new URLSearchParams({ image_url: imageUrl, caption, access_token: input.accessToken }),
    fetchImpl,
    "prepare the image",
  );
  if (!container.id) {
    throw new ConnectorError("rejected", "Instagram did not return a media container id.");
  }

  // 2. The publish. Between these two calls nothing is visible on Instagram,
  //    so a failure here leaves an unpublished container and no post — which is
  //    why only this step can be `outcome_unknown`.
  const published = await post(
    `${GRAPH_URL}/${input.igUserId}/media_publish`,
    new URLSearchParams({ creation_id: container.id, access_token: input.accessToken }),
    fetchImpl,
    "publish the post",
  );

  if (!published.id) {
    throw new ConnectorError(
      "outcome_unknown",
      "Instagram accepted the post but returned no id. Check the account before retrying.",
    );
  }

  return {
    externalId: published.id,
    // The canonical permalink needs another call; this one resolves for the
    // owner of the post, which is who reads a receipt.
    permalink: `https://www.instagram.com/p/${published.id}/`,
  };
}
