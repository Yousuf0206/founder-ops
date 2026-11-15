import type { SocialPlatform } from "@/lib/content/platforms";

/**
 * Platforms with a live publish connector (decisions §3). Drafting works for
 * every platform regardless; only these may ever reach a publish job.
 *
 *   linkedin   002 — member posts via the Posts API
 *   facebook   006 — Page posts via the Graph API
 *   instagram  006 — professional accounts via the Content Publishing API.
 *              Caption-only posts do not exist on Instagram: a post without an
 *              image is refused at publish time with a sentence saying so
 *              (lib/connectors/meta/publish.ts). Being on this list means the
 *              connector exists, not that every post can use it.
 *   x          006 — posts via /2/tweets. Needs a PAID X API tier; the free
 *              tier connects fine and then refuses to post.
 *
 * TikTok and YouTube are deliberately absent. Both APIs publish video and
 * nothing else, and this product writes words — connecting them would promise
 * a publish that could never happen. They stay Copy-only until there is a video
 * to upload.
 *
 * Pure and publish-free, so UI may import it; the guard script only restricts
 * lib/connectors/<platform>/publish.ts.
 */
export const LIVE_PUBLISH_PLATFORMS: readonly SocialPlatform[] = [
  "linkedin",
  "facebook",
  "instagram",
  "x",
];

export function hasLiveConnector(platform: string): boolean {
  return (LIVE_PUBLISH_PLATFORMS as readonly string[]).includes(platform.trim().toLowerCase());
}

/**
 * Platforms whose publish path needs an image on the post itself (006).
 *
 * Separate from `hasLiveConnector` on purpose: "we can publish to Instagram"
 * and "this particular post can be published to Instagram" are different
 * claims, and conflating them is what would put a Publish button on a post that
 * is going to be refused. The UI asks this before offering the button; the
 * connector enforces it regardless.
 */
export const MEDIA_REQUIRED_PLATFORMS: readonly SocialPlatform[] = ["instagram"];

export function requiresImage(platform: string): boolean {
  return (MEDIA_REQUIRED_PLATFORMS as readonly string[]).includes(platform.trim().toLowerCase());
}
