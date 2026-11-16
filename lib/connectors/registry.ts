import type { SocialPlatform } from "@/lib/content/platforms";

/**
 * Platforms with a live publish connector (decisions §3). Drafting works for
 * every platform regardless; only these may ever reach a publish job.
 *
 *   linkedin   002 — member posts via the Posts API
 *   facebook   006 — Page posts via the Graph API
 *   instagram  006 — professional accounts via the Content Publishing API
 *   x          006 — posts via /2/tweets. Needs a PAID X API tier; the free
 *              tier connects fine and then refuses to post.
 *   tiktok     007 — a photo post or a video, via the Content Posting API
 *   youtube    007 — a video upload via videos.insert
 *
 * 006 left TikTok and YouTube off this list with a true reason: their APIs
 * publish media and this product writes words. 007 did not overrule that — it
 * removed the premise, by adding `video_url` so a founder can supply the one
 * thing those platforms need. The reason now lives in `PLATFORM_MEDIA` below as
 * a rule rather than as an exclusion: YouTube cannot publish words alone (there
 * is no endpoint for it in the Data API at all), so a YouTube post without a
 * video is refused — but the platform itself is reachable.
 *
 * Being on this list means the connector exists, not that every post can use
 * it. That distinction is `PLATFORM_MEDIA`, and keeping the two apart is what
 * stops a Publish button appearing on a post that is certain to be refused.
 *
 * Pure and publish-free, so UI may import it; the guard script only restricts
 * lib/connectors/<platform>/publish.ts.
 */
export const LIVE_PUBLISH_PLATFORMS: readonly SocialPlatform[] = [
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "tiktok",
  "youtube",
];

export function hasLiveConnector(platform: string): boolean {
  return (LIVE_PUBLISH_PLATFORMS as readonly string[]).includes(platform.trim().toLowerCase());
}

/**
 * What a platform's publish path needs on the post itself (007 FR-02).
 *
 *   none            the words are enough
 *   image           an image is required and a video is not accepted
 *   video           a video is required
 *   image_or_video  either will do, and a video is preferred when both exist
 *
 * This was a boolean in 006, when Instagram was the only platform with a rule.
 * TikTok takes an image *or* a video and YouTube takes only a video, which a
 * boolean cannot say — and the alternative, a second boolean, would have meant
 * four platform-named conditions in the UI that could disagree with each other.
 * One enum, read everywhere, is the seam.
 */
export type MediaRequirement = "none" | "image" | "video" | "image_or_video";

export const PLATFORM_MEDIA: Record<SocialPlatform, MediaRequirement> = {
  linkedin: "none",
  facebook: "none",
  x: "none",
  // No caption-only post exists on Instagram; the Content Publishing API has
  // no endpoint for one.
  instagram: "image",
  // A photo post (media_type: PHOTO) or a video, both pulled from a URL.
  tiktok: "image_or_video",
  // videos.insert takes real bytes and there is no community-post endpoint in
  // the Data API, so words alone are not publishable here by any means.
  youtube: "video",
};

export function mediaRequirement(platform: string): MediaRequirement {
  const key = platform.trim().toLowerCase() as SocialPlatform;
  return PLATFORM_MEDIA[key] ?? "none";
}

/** Platforms that cannot publish the words on their own. */
export function requiresMedia(platform: string): boolean {
  return mediaRequirement(platform) !== "none";
}

/**
 * An image, specifically, is required — Instagram only.
 *
 * Kept with this exact meaning from 006 so existing callers and tests keep
 * saying what they said. "Can this post carry an image?" is `acceptsImage`.
 */
export function requiresImage(platform: string): boolean {
  return mediaRequirement(platform) === "image";
}

/** A video, specifically, is required — YouTube only. */
export function requiresVideo(platform: string): boolean {
  return mediaRequirement(platform) === "video";
}

/** Whether an image URL is worth asking a founder for on this platform. */
export function acceptsImage(platform: string): boolean {
  const requirement = mediaRequirement(platform);
  return requirement === "image" || requirement === "image_or_video";
}

/** Whether a video URL is worth asking a founder for on this platform. */
export function acceptsVideo(platform: string): boolean {
  const requirement = mediaRequirement(platform);
  return requirement === "video" || requirement === "image_or_video";
}

/**
 * Whether this particular post has what its platform requires — the question
 * the UI asks before offering an Approve or a Publish button.
 *
 * The connectors enforce the same rule regardless, because a UI check is a
 * courtesy and a connector check is a guarantee.
 */
export function hasRequiredMedia(
  platform: string,
  media: { imageUrl?: string | null; videoUrl?: string | null },
): boolean {
  const image = (media.imageUrl ?? "").trim().length > 0;
  const video = (media.videoUrl ?? "").trim().length > 0;

  switch (mediaRequirement(platform)) {
    case "none":
      return true;
    case "image":
      return image;
    case "video":
      return video;
    case "image_or_video":
      return image || video;
  }
}

/**
 * The sentence shown on a post that cannot be published yet, and the reason
 * given when a connector refuses one.
 *
 * Written once, here, so the screen and the refusal say the same thing — and
 * written as "what to do" rather than "what is missing", because a founder
 * reading it is holding a post they want to send.
 */
export function mediaRequirementReason(platform: string): string | null {
  switch (mediaRequirement(platform)) {
    case "none":
      return null;
    case "image":
      return "Instagram cannot publish a caption on its own — every post needs an image. Add an image URL to this post, or copy the caption and post it from your phone.";
    case "video":
      return "YouTube has no way to publish text: its API only takes a video upload. Add a public video URL to this post, or copy the title and description and upload the video yourself.";
    case "image_or_video":
      return "TikTok posts carry media — add a public video URL, or an image URL for a photo post. Without either, copy the script and record it yourself.";
  }
}
