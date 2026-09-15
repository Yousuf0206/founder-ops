import type { SocialPlatform } from "@/lib/content/platforms";

/**
 * Platforms with a live publish connector (decisions §3). Drafting works for
 * every platform regardless; only these may ever reach a publish job.
 * Phase 2: LinkedIn. Phase 5 adds Meta (Facebook Page + Instagram).
 *
 * Pure and publish-free, so UI may import it; the guard script only restricts
 * lib/connectors/<platform>/publish.ts.
 */
export const LIVE_PUBLISH_PLATFORMS: readonly SocialPlatform[] = ["linkedin"];

export function hasLiveConnector(platform: string): boolean {
  return (LIVE_PUBLISH_PLATFORMS as readonly string[]).includes(platform.trim().toLowerCase());
}
