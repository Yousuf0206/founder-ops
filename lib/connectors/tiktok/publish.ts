import "server-only";

import type { ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Publishing to TikTok (007 T-3).
 *
 * Import rule, enforced by scripts/check-publish-guards.mjs: only
 * lib/publish/execute.ts may import this module, so nothing can post to TikTok
 * without passing the claim check and the cap reservation first.
 *
 * Verified against TikTok's Content Posting API reference on 2026-11-16. Four
 * things make this connector unlike the others:
 *
 *   1. **Two endpoints, one platform.** A post with a video goes to
 *      `/video/init/`; a post with only an image goes to `/content/init/` with
 *      `media_type: PHOTO`. The payload decides, and a post with both takes the
 *      video — that is what TikTok is for, and quietly publishing a video post
 *      as a photo would send something the founder did not approve.
 *
 *   2. **`privacy_level` is required and cannot be guessed.** It must be one of
 *      the values `creator_info/query` returns for that creator, and sending
 *      one they cannot use is a documented 403 that would read to a founder as
 *      "TikTok is broken". So we ask, then pick the most public value the
 *      creator actually allows.
 *
 *   3. **TikTok does not publish synchronously.** Both endpoints answer with a
 *      `publish_id` and then fetch the media themselves. So the receipt is the
 *      publish id, and the permalink only exists if a bounded wait sees the
 *      post go public. See `awaitPublish` for why the wait is bounded and why
 *      "still processing" is recorded as published rather than as failed.
 *
 *   4. **Both media URLs must sit on a domain verified in the TikTok developer
 *      portal.** This is the single most likely production failure, so
 *      `url_ownership_unverified` is translated into that setup step by name.
 *
 * And one product fact worth saying out loud: until the owner's app passes
 * TikTok's audit, everything posted through it is private no matter what
 * `privacy_level` says. That is stated on the connections page before a founder
 * connects, and the matching 403 repeats it.
 */

const API = "https://open.tiktokapis.com/v2";
const CREATOR_INFO_URL = `${API}/post/publish/creator_info/query/`;
const VIDEO_INIT_URL = `${API}/post/publish/video/init/`;
const CONTENT_INIT_URL = `${API}/post/publish/content/init/`;
const STATUS_URL = `${API}/post/publish/status/fetch/`;

/** Documented maxima, in UTF-16 code units, which is what TikTok counts. */
export const TIKTOK_VIDEO_TITLE_LIMIT = 2_200;
export const TIKTOK_PHOTO_TITLE_LIMIT = 90;
export const TIKTOK_PHOTO_DESCRIPTION_LIMIT = 4_000;

/**
 * Privacy levels, most public first. The connector takes the first one the
 * creator's own options allow, so a private account stays private and a public
 * one is not silently hidden.
 */
const PRIVACY_PREFERENCE = [
  "PUBLIC_TO_EVERYONE",
  "FOLLOWER_OF_CREATOR",
  "MUTUAL_FOLLOW_FRIENDS",
  "SELF_ONLY",
] as const;

/** The approved body, in reading order — exactly what the claim check saw. */
export function composeTikTokBody(payload: ContentPayload): string {
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

/**
 * The short line a photo post needs, which TikTok caps at 90.
 *
 * Nothing is cut mid-sentence: the hook is used when it fits, and otherwise the
 * first sentence that does. A title that stops mid-word is not text a human
 * approved, which is the same rule `composeXPost` follows.
 */
export function composeTikTokPhotoTitle(payload: ContentPayload): string {
  const candidates = [payload.hook, payload.script, payload.cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => [part, ...part.split(/(?<=[.!?])\s+/).map((s) => s.trim())]);

  for (const candidate of candidates) {
    if (candidate && candidate.length <= TIKTOK_PHOTO_TITLE_LIMIT) return candidate;
  }
  return "";
}

/**
 * Thrown when a TikTok post has neither a video nor an image.
 *
 * Its own class for the same reason `InstagramMediaRequiredError` has one: it
 * is a refusal the founder can fix in the post itself, and the card says so
 * before they ever press publish.
 */
export class TikTokMediaRequiredError extends ConnectorError {
  constructor() {
    super(
      "rejected",
      "TikTok posts carry media — add a public video URL, or an image URL for a photo post. Without either, copy the script and record it yourself.",
    );
    this.name = "TikTokMediaRequiredError";
  }
}

type TikTokEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string; logid?: string };
};

/**
 * One POST to TikTok, with the error taxonomy applied.
 *
 * Note the first check: TikTok answers HTTP 200 with `error.code: "ok"` on
 * success and can answer HTTP 200 with a *failure* code, so the body is
 * authoritative and the status alone is not.
 */
async function post<T>(
  url: string,
  accessToken: string,
  body: unknown,
  fetchImpl: typeof fetch,
  what: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // The request may have reached TikTok before the connection broke.
    throw new ConnectorError(
      "outcome_unknown",
      `The connection to TikTok failed while trying to ${what}, so it is unknown whether anything was posted. Check the account before retrying.`,
    );
  }

  const envelope = (await response.json().catch(() => ({}))) as TikTokEnvelope<T>;
  const code = envelope.error?.code ?? (response.ok ? "ok" : `http_${response.status}`);

  if (code === "ok") {
    if (!envelope.data) {
      throw new ConnectorError("rejected", `TikTok returned no data when asked to ${what}.`);
    }
    return envelope.data;
  }

  throw mapTikTokError(code, envelope.error?.message, response.status, what);
}

/** TikTok's documented `error.code` values, mapped onto the taxonomy. */
export function mapTikTokError(
  code: string,
  message: string | undefined,
  status: number,
  what: string,
): ConnectorError {
  const detail = message || code;

  switch (code) {
    case "access_token_invalid":
    case "scope_not_authorized":
      return new ConnectorError(
        "token_revoked",
        `TikTok rejected the connection: ${detail}. Reconnect the account.`,
      );

    case "rate_limit_exceeded":
      return new ConnectorError(
        "rate_limited",
        `TikTok rate-limited the request: ${detail}. Nothing was posted.`,
      );

    case "spam_risk_too_many_posts":
      return new ConnectorError(
        "rate_limited",
        "TikTok has hit its daily limit on posts made through the API for this account. Nothing was posted; try again tomorrow.",
      );

    case "url_ownership_unverified":
      // The single most likely production failure, and the one a generic
      // refusal would waste a day on.
      return new ConnectorError(
        "rejected",
        "TikTok will only fetch media from a domain you have verified. Add the domain hosting this video or image to your TikTok developer app, under URL prefix verification, then try again.",
      );

    case "unaudited_client_can_only_post_to_private_accounts":
      return new ConnectorError(
        "rejected",
        "TikTok keeps posts from an unaudited app private. The post cannot be made public until this app passes TikTok's audit.",
      );

    case "privacy_level_option_mismatch":
      return new ConnectorError(
        "rejected",
        `TikTok refused the post's privacy setting: ${detail}. This account's own settings decide what is allowed.`,
      );

    case "spam_risk_user_banned_from_posting":
      return new ConnectorError(
        "rejected",
        "TikTok has blocked this account from posting. Nothing here can change that; contact TikTok.",
      );

    case "reached_active_user_cap":
      return new ConnectorError(
        "rate_limited",
        "This app has reached TikTok's daily cap on publishing users. Nothing was posted.",
      );

    case "internal_error":
      return new ConnectorError("unavailable", `TikTok returned an internal error: ${detail}`);

    default:
      if (status >= 500) {
        return new ConnectorError("unavailable", `TikTok returned ${status}: ${detail}`);
      }
      return new ConnectorError("rejected", `TikTok refused to ${what}: ${detail}`);
  }
}

type CreatorInfo = {
  creator_username?: string;
  privacy_level_options?: string[];
};

/**
 * What this creator is allowed to do, which TikTok requires us to ask before a
 * direct post. It also supplies the username, which is the only way to build a
 * permalink that resolves.
 */
export async function fetchTikTokCreatorInfo(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ username: string; privacyLevel: string }> {
  const info = await post<CreatorInfo>(
    CREATOR_INFO_URL,
    accessToken,
    {},
    fetchImpl,
    "read the account's posting settings",
  );

  const allowed = info.privacy_level_options ?? [];
  const privacyLevel = PRIVACY_PREFERENCE.find((level) => allowed.includes(level));

  if (!privacyLevel) {
    throw new ConnectorError(
      "rejected",
      "TikTok did not offer any privacy setting this account may post with, so there is no setting to send. Check the account's posting permissions in the TikTok app.",
    );
  }

  return { username: info.creator_username ?? "", privacyLevel };
}

export type TikTokStatus =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

type StatusData = {
  status?: TikTokStatus;
  fail_reason?: string;
  publicaly_available_post_id?: (string | number)[];
};

/** Fail reasons the founder can act on, and the sentence for each. */
const FAIL_REASONS: Record<string, string> = {
  photo_pull_failed:
    "TikTok could not download the image. Check that the URL is public and that its domain is verified in your TikTok developer app.",
  video_pull_failed:
    "TikTok could not download the video. Check that the URL is public and that its domain is verified in your TikTok developer app.",
  file_format_check_failed: "TikTok rejected the media's file format.",
  duration_check_failed: "TikTok rejected the video's length.",
  frame_rate_check_failed: "TikTok rejected the video's frame rate.",
  picture_size_check_failed: "TikTok rejected the image's dimensions.",
  spam_risk_text: "TikTok flagged the post's text as spam and did not publish it.",
  spam_risk: "TikTok flagged the post as spam and did not publish it.",
  spam_risk_too_many_posts:
    "TikTok has hit its daily limit on posts made through the API for this account.",
  spam_risk_user_banned_from_posting: "TikTok has blocked this account from posting.",
  auth_removed: "The TikTok account withdrew this app's permission mid-publish. Reconnect it.",
  publish_cancelled: "The post was cancelled in the TikTok app.",
};

/**
 * Waits, briefly, to see whether TikTok actually published.
 *
 * Why wait at all: TikTok's answer to a publish is "I have your request", not
 * "it is live". Without this a founder would get a receipt with no link and no
 * way to tell acceptance from loss.
 *
 * Why the wait is bounded: this runs inside the publish function, which has a
 * time budget (NFR-03), and TikTok's own transcode has no deadline. So after a
 * few short intervals the connector stops asking and reports what it knows —
 * TikTok accepted the post — with the publish id as the receipt and no
 * permalink. That is `published`, because it is true and because recording it
 * as failed would invite a retry that double-posts.
 *
 * A `FAILED` status, by contrast, is a real failure and is mapped by its
 * `fail_reason`, since a pull failure is a URL the founder can fix and a
 * spam-risk refusal is not.
 */
async function awaitPublish(
  input: { accessToken: string; publishId: string; username: string },
  fetchImpl: typeof fetch,
  options: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<{ externalId: string; permalink: string | null }> {
  const attempts = options.attempts ?? 5;
  const intervalMs = options.intervalMs ?? 2_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(intervalMs);

    let data: StatusData;
    try {
      data = await post<StatusData>(
        STATUS_URL,
        input.accessToken,
        { publish_id: input.publishId },
        fetchImpl,
        "check whether the post went live",
      );
    } catch {
      /*
       * The publish already succeeded; this is only the question "is it live
       * yet". A rate limit, a dropped connection or an expired token here says
       * nothing about the post, so failing the job over it would report an
       * accepted post as failed — and a retry of that job would post twice in
       * public.
       *
       * So stop asking and report what is known: TikTok has it, and we have no
       * link.
       */
      return { externalId: input.publishId, permalink: null };
    }

    if (data.status === "FAILED") {
      const reason = data.fail_reason ?? "";
      throw new ConnectorError(
        "rejected",
        FAIL_REASONS[reason] ?? `TikTok could not publish the post: ${reason || "no reason given"}.`,
      );
    }

    if (data.status === "PUBLISH_COMPLETE") {
      const postId = data.publicaly_available_post_id?.[0];
      // A public post id only exists for a post TikTok made public. An
      // unaudited app's posts are private, so there is genuinely no link to
      // give, and inventing a profile URL would be a link to the wrong thing.
      return {
        externalId: String(postId ?? input.publishId),
        permalink:
          postId && input.username
            ? `https://www.tiktok.com/@${input.username}/video/${postId}`
            : null,
      };
    }
  }

  return { externalId: input.publishId, permalink: null };
}

export async function publishToTikTok(
  input: { accessToken: string; openId: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
  options: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ externalId: string; permalink: string | null }> {
  const videoUrl = input.payload.video_url.trim();
  const imageUrl = input.payload.image_url.trim();

  // Before any API call, as Instagram does: this is the founder's to fix.
  if (!videoUrl && !imageUrl) throw new TikTokMediaRequiredError();

  const body = composeTikTokBody(input.payload);
  if (!body) throw new ConnectorError("rejected", "The approved body is empty.");

  const { username, privacyLevel } = await fetchTikTokCreatorInfo(input.accessToken, fetchImpl);

  let publishId: string;

  if (videoUrl) {
    // A video post. The title carries the whole approved body.
    if (body.length > TIKTOK_VIDEO_TITLE_LIMIT) {
      throw new ConnectorError(
        "rejected",
        `The post is ${body.length} characters; TikTok allows ${TIKTOK_VIDEO_TITLE_LIMIT}. Edit the draft and approve it again.`,
      );
    }

    const data = await post<{ publish_id?: string }>(
      VIDEO_INIT_URL,
      input.accessToken,
      {
        post_info: { title: body, privacy_level: privacyLevel },
        source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
      },
      fetchImpl,
      "start the video post",
    );
    if (!data.publish_id) {
      throw new ConnectorError(
        "outcome_unknown",
        "TikTok accepted the video but returned no publish id. Check the account before retrying.",
      );
    }
    publishId = data.publish_id;
  } else {
    // A photo post. TikTok splits this into a short title and a description,
    // and the description is where the approved words go.
    if (body.length > TIKTOK_PHOTO_DESCRIPTION_LIMIT) {
      throw new ConnectorError(
        "rejected",
        `The post is ${body.length} characters; TikTok allows ${TIKTOK_PHOTO_DESCRIPTION_LIMIT} on a photo post. Edit the draft and approve it again.`,
      );
    }

    const data = await post<{ publish_id?: string }>(
      CONTENT_INIT_URL,
      input.accessToken,
      {
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
        post_info: {
          title: composeTikTokPhotoTitle(input.payload),
          description: body,
          privacy_level: privacyLevel,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: [imageUrl],
          photo_cover_index: 0,
        },
      },
      fetchImpl,
      "start the photo post",
    );
    if (!data.publish_id) {
      throw new ConnectorError(
        "outcome_unknown",
        "TikTok accepted the photo post but returned no publish id. Check the account before retrying.",
      );
    }
    publishId = data.publish_id;
  }

  return awaitPublish({ accessToken: input.accessToken, publishId, username }, fetchImpl, options);
}
