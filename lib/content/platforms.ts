/**
 * The six networks drafts are written for (002 FR-M-001), whether or not a
 * publish connector exists for them yet.
 */

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "x", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
};

/** FR-M-003: native length and tone per platform, handed to the model as the brief. */
export const PLATFORM_NORMS: Record<SocialPlatform, string> = {
  instagram:
    "Reel or carousel. Hook in the first line; caption under 2,200 characters; 3–8 relevant hashtags.",
  facebook: "Conversational post of 40–120 words; one clear call to action; 0–2 hashtags.",
  linkedin:
    "Professional first-person post of 150–300 words; short paragraphs; up to 3 hashtags; no clickbait.",
  tiktok:
    "15–45 second vertical video script; spoken hook in the first 2 seconds; casual; 3–5 hashtags.",
  x: "One post under 280 characters, or a thread of at most 5 posts; 0–2 hashtags.",
  youtube:
    "Title under 70 characters; description with a clear first two lines; script with a strong open.",
};

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export function platformLabel(value: string): string {
  return isSocialPlatform(value) ? PLATFORM_LABELS[value] : value;
}
