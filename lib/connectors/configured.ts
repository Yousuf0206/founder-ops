import "server-only";

import { isLinkedInConfigured } from "@/lib/connectors/linkedin/oauth";
import { isMetaConfigured } from "@/lib/connectors/meta/oauth";
import { isTikTokConfigured } from "@/lib/connectors/tiktok/oauth";
import { isXConfigured } from "@/lib/connectors/x/oauth";
import { isYouTubeConfigured } from "@/lib/connectors/youtube/oauth";

/**
 * Whether THIS SERVER holds credentials for a platform (007).
 *
 * Separate from whether a connector exists (`hasLiveConnector`): a deployment
 * with no TIKTOK_CLIENT_KEY should still show TikTok and say it is not
 * configured, because telling an owner that is more use than hiding the row and
 * leaving them to guess.
 *
 * It lives in one file because by 007 there were three copies of this switch —
 * the connections page, the Instant Publish screen, and the connect route — and
 * a fourth platform would have made the disagreement between them inevitable.
 * The disagreement would have surfaced as a founder clicking Connect and
 * arriving at "not configured", which is the exact thing the check exists to
 * prevent.
 *
 * Presence of keys only. It never claims the platform accepts them: for X a
 * working key on a free tier still cannot post, and for TikTok an unaudited app
 * posts privately.
 */
export function platformConfigured(platform: string): boolean {
  switch (platform.trim().toLowerCase()) {
    case "linkedin":
      return isLinkedInConfigured();
    // One Meta app serves both.
    case "facebook":
    case "instagram":
      return isMetaConfigured();
    case "x":
      return isXConfigured();
    case "tiktok":
      return isTikTokConfigured();
    case "youtube":
      return isYouTubeConfigured();
    default:
      return false;
  }
}

/** The sentence to show an owner when a platform's keys are missing. */
export function configurationHint(platform: string): string | null {
  if (platformConfigured(platform)) return null;

  switch (platform.trim().toLowerCase()) {
    case "linkedin":
      return "LinkedIn is not configured on the server. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_API_VERSION.";
    case "facebook":
    case "instagram":
      return "Meta is not configured on the server. Set META_APP_ID and META_APP_SECRET.";
    case "x":
      return "X is not configured on the server. Set X_CLIENT_ID and X_CLIENT_SECRET.";
    case "tiktok":
      return "TikTok is not configured on the server. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.";
    case "youtube":
      return "YouTube is not configured on the server. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.";
    default:
      return `Publishing to ${platform} is not available. Drafts still work.`;
  }
}
