import "server-only";

import type { ContentPayload } from "@/lib/ai/content";
import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Uploading a video to YouTube (007 T-5).
 *
 * Import rule, enforced by scripts/check-publish-guards.mjs: only
 * lib/publish/execute.ts may import this module.
 *
 * Verified against the videos.insert reference and the resumable-upload
 * protocol guide on 2026-11-16. This is the only connector in the product that
 * moves a file, and that is not a choice — the YouTube Data API has no endpoint
 * that publishes text or an image. Its resource list has no community-post
 * resource at all: `commentThreads.insert` writes a comment and
 * `channelBanners.insert` uploads a banner, and neither is a post. So either a
 * video goes up or nothing does, which is what `requiresVideo` encodes and what
 * `YouTubeVideoRequiredError` says to the founder.
 *
 * How the bytes travel:
 *
 *   1. HEAD the video URL, to learn its size. The resumable session wants the
 *      length up front, and a URL that will not say how big it is cannot be
 *      uploaded this way.
 *   2. Open a resumable session. Google answers 200 with the session URI in the
 *      `Location` header — not in the body.
 *   3. GET the video and PUT its response body straight into that session
 *      (`duplex: "half"`), so the file is never buffered in memory and never
 *      touches a filesystem this runtime does not promise to have.
 *
 * And the limit that follows from running inside a publish function: a video
 * that cannot plausibly stream through in the function's time budget is refused
 * *before* the session opens, with its size and the cap, rather than killed
 * halfway (NFR-03).
 */

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

/** Documented maxima for the fields this connector sets. */
export const YOUTUBE_TITLE_LIMIT = 100;
export const YOUTUBE_DESCRIPTION_LIMIT = 5_000;

/**
 * The largest video this connector will stream.
 *
 * Not a YouTube limit — YouTube takes 256 GB. It is this product's limit,
 * because the upload streams through a serverless function that stops after 60
 * seconds, and a refusal naming a number is worth more to a founder than a
 * timeout halfway through a 2 GB file. Raising it means raising `maxDuration`
 * on the cron route first, and being on a plan that allows it.
 */
export const YOUTUBE_MAX_VIDEO_BYTES = 128 * 1024 * 1024;

/**
 * "People & Blogs".
 *
 * `categoryId` is required by YouTube and no part of a growth pack describes
 * one, so it is a stated default rather than a guess dressed up as data.
 * Changing it per post would need a field nobody has asked for.
 */
const DEFAULT_CATEGORY_ID = "22";

/**
 * Thrown when a YouTube post has no video.
 *
 * Its own class, like Instagram's and TikTok's, because the founder can fix it
 * in the post — and because the reason is a fact about the API rather than a
 * limitation of this product, which the message says plainly.
 */
export class YouTubeVideoRequiredError extends ConnectorError {
  constructor() {
    super(
      "rejected",
      "YouTube has no way to publish text: its API only takes a video upload. Add a public video URL to this post, or copy the title and description and upload the video yourself.",
    );
    this.name = "YouTubeVideoRequiredError";
  }
}

/**
 * The video's title, which YouTube caps at 100 characters.
 *
 * The pack already writes titles for YouTube — its platform norm asks for one
 * under 70 characters — so the first title that fits is used, then the hook,
 * then the first sentence that fits. Nothing is truncated: a title cut
 * mid-phrase is not what a human approved, the same rule `composeXPost` and
 * `composeTikTokPhotoTitle` follow.
 */
export function composeYouTubeTitle(payload: ContentPayload): string {
  const candidates = [
    ...payload.titles,
    payload.hook,
    ...payload.hook.split(/(?<=[.!?])\s+/),
    ...payload.script.split(/(?<=[.!?])\s+/),
  ].map((part) => part.trim());

  for (const candidate of candidates) {
    if (candidate && candidate.length <= YOUTUBE_TITLE_LIMIT) return candidate;
  }
  return "";
}

/** The approved body as the video's description. */
export function composeYouTubeDescription(payload: ContentPayload): string {
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

type GoogleError = { error?: { message?: string; errors?: { reason?: string }[] } };

/** Google's documented error reasons, mapped onto the connector taxonomy. */
function mapGoogleError(status: number, body: GoogleError, what: string): ConnectorError {
  const reason = body.error?.errors?.[0]?.reason ?? "";
  const detail = body.error?.message || reason || `HTTP ${status}`;

  if (status === 401) {
    return new ConnectorError(
      "token_revoked",
      `YouTube rejected the token: ${detail}. Reconnect the channel.`,
    );
  }

  switch (reason) {
    case "quotaExceeded":
      return new ConnectorError(
        "rate_limited",
        "This app has used its YouTube API quota for the day (uploads are capped at 100 per day per project). Nothing was uploaded.",
      );
    case "uploadLimitExceeded":
      return new ConnectorError(
        "rate_limited",
        "This channel has reached YouTube's limit on uploads for now. Nothing was uploaded; try again later.",
      );
    case "youtubeSignupRequired":
      return new ConnectorError(
        "rejected",
        "The connected Google account has no YouTube channel. Create one and reconnect.",
      );
    case "forbidden":
    case "forbiddenLicenseSetting":
    case "forbiddenPrivacySetting":
      return new ConnectorError(
        "rejected",
        `YouTube refused the upload: ${detail}. The channel may not be allowed to upload, or may need verifying in YouTube Studio.`,
      );
    case "invalidTitle":
    case "invalidDescription":
    case "invalidTags":
    case "invalidCategoryId":
    case "invalidVideoMetadata":
      return new ConnectorError(
        "rejected",
        `YouTube rejected the post's wording: ${detail}. Edit the draft and approve it again.`,
      );
  }

  if (status === 429) {
    return new ConnectorError("rate_limited", `YouTube rate-limited the request: ${detail}.`);
  }
  if (status >= 500) {
    return new ConnectorError("unavailable", `YouTube returned ${status}: ${detail}`);
  }
  return new ConnectorError("rejected", `YouTube refused to ${what}: ${detail}`);
}

/** What the video URL is, before anything is opened at YouTube's end. */
async function probeVideo(
  videoUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ size: number; contentType: string }> {
  let response: Response;
  try {
    response = await fetchImpl(videoUrl, { method: "HEAD" });
  } catch {
    throw new ConnectorError(
      "rejected",
      "The video URL could not be reached. It has to be a public link this server can download.",
    );
  }

  if (!response.ok) {
    throw new ConnectorError(
      "rejected",
      `The video URL answered ${response.status}. It has to be a public link this server can download.`,
    );
  }

  const length = Number(response.headers.get("content-length") ?? "");
  if (!Number.isFinite(length) || length <= 0) {
    throw new ConnectorError(
      "rejected",
      "The video URL does not say how large the file is, and YouTube's resumable upload needs that up front. Host the video somewhere that reports a content length.",
    );
  }

  if (length > YOUTUBE_MAX_VIDEO_BYTES) {
    const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
    throw new ConnectorError(
      "rejected",
      `The video is ${mb(length)} MB and this uploader stops at ${mb(YOUTUBE_MAX_VIDEO_BYTES)} MB, because it streams through a function with a time limit. Upload a shorter or more compressed cut, or put it on YouTube yourself.`,
    );
  }

  return {
    size: length,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function publishToYouTube(
  input: { accessToken: string; channelId: string; payload: ContentPayload },
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalId: string; permalink: string }> {
  const videoUrl = input.payload.video_url.trim();
  // Before any API call: this is the founder's to fix, and no amount of code
  // can publish an un-made video.
  if (!videoUrl) throw new YouTubeVideoRequiredError();

  const title = composeYouTubeTitle(input.payload);
  if (!title) {
    throw new ConnectorError(
      "rejected",
      `Every YouTube video needs a title of ${YOUTUBE_TITLE_LIMIT} characters or fewer, and nothing in this post is short enough to use as one. Add a shorter hook or title and approve it again.`,
    );
  }

  const description = composeYouTubeDescription(input.payload);
  if (description.length > YOUTUBE_DESCRIPTION_LIMIT) {
    throw new ConnectorError(
      "rejected",
      `The description is ${description.length} characters; YouTube allows ${YOUTUBE_DESCRIPTION_LIMIT}. Edit the draft and approve it again.`,
    );
  }

  const video = await probeVideo(videoUrl, fetchImpl);

  // 1. Open the resumable session. Nothing is visible on YouTube yet.
  let init: Response;
  try {
    init = await fetchImpl(`${UPLOAD_URL}?uploadType=resumable&part=snippet%2Cstatus`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(video.size),
        "x-upload-content-type": video.contentType,
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          tags: input.payload.hashtags
            .map((tag) => tag.replace(/^#/, "").trim())
            .filter(Boolean)
            .slice(0, 15),
          categoryId: DEFAULT_CATEGORY_ID,
        },
        // `selfDeclaredMadeForKids` is deliberately not set: it is a legal
        // declaration about the content's audience that belongs to the person
        // publishing, not to this code, so the channel's own setting applies.
        status: { privacyStatus: "public" },
      }),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach YouTube to start the upload.");
  }

  if (!init.ok) {
    const body = (await init.json().catch(() => ({}))) as GoogleError;
    throw mapGoogleError(init.status, body, "start the upload");
  }

  const session = init.headers.get("location");
  if (!session) {
    throw new ConnectorError(
      "unavailable",
      "YouTube accepted the upload request but returned no upload session. Nothing was uploaded.",
    );
  }

  // 2. Fetch the video and stream it into the session. The body is piped
  //    through, never read into memory.
  let source: Response;
  try {
    source = await fetchImpl(videoUrl);
  } catch {
    throw new ConnectorError("rejected", "The video URL could not be downloaded.");
  }
  if (!source.ok || !source.body) {
    throw new ConnectorError(
      "rejected",
      `The video URL answered ${source.status} when the upload tried to read it.`,
    );
  }

  let upload: Response;
  try {
    upload = await fetchImpl(session, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-length": String(video.size),
        "content-type": video.contentType,
      },
      body: source.body,
      // Required by Node's fetch to send a stream as the request body.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  } catch {
    // The upload may have completed and the answer been lost. A retry here
    // would publish the same video twice, so this is never a clean failure.
    throw new ConnectorError(
      "outcome_unknown",
      "The connection to YouTube broke while the video was uploading, so it is unknown whether the video was created. Check the channel before retrying.",
    );
  }

  const body = (await upload.json().catch(() => ({}))) as { id?: string } & GoogleError;

  if (upload.status === 308) {
    // Google stored only part of the file. No video resource exists, so nothing
    // was published and a retry is safe.
    throw new ConnectorError(
      "unavailable",
      "YouTube received only part of the video, so nothing was published. Try again.",
    );
  }

  if (!upload.ok) {
    throw mapGoogleError(upload.status, body, "upload the video");
  }

  if (!body.id) {
    throw new ConnectorError(
      "outcome_unknown",
      "YouTube accepted the upload but returned no video id. It is probably on the channel — check before retrying.",
    );
  }

  return { externalId: body.id, permalink: `https://www.youtube.com/watch?v=${body.id}` };
}
