import { z } from "zod";

/**
 * Boundary validation for self-serve workspace creation.
 *
 * Mirrors the database checks on `workspaces` (name 1–120 chars after trim,
 * slug `^[a-z0-9]+(-[a-z0-9]+)*$`) so a bad submission fails with a readable
 * message instead of a constraint violation.
 */

/** How long an invitation link stays redeemable. */
export const INVITATION_TTL_DAYS = 7;

export const invitationCreateSchema = z.object({
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email("Enter a valid email address.").max(320)),
  // Ownership is never handed out by invitation.
  role: z.enum(["editor", "viewer"], { message: "Choose a role." }),
});

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Lumo Learn!" → "lumo-learn". Returns "" when nothing usable remains. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").trim())
    .pipe(z.string().max(max, `${label} must be ${max} characters or fewer.`));

/** 002 FR-O-001: name, slug, niche, primary URL, goals, and tone at creation. */
export const workspaceCreateSchema = z
  .object({
    name: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Enter a workspace name.").max(120)),
    // Optional: derived from the name when left blank.
    slug: z.string().nullish(),
    niche: optionalText(200, "Niche"),
    goals: optionalText(2000, "Goals"),
    tone: optionalText(200, "Tone"),
    primary_url: z
      .string()
      .nullish()
      .transform((s) => (s ?? "").trim())
      .pipe(
        z.union([
          z.literal(""),
          z
            .string()
            .max(2000)
            .url("Enter a full URL, starting with https://.")
            .regex(/^https?:\/\//i, "The URL must start with http:// or https://."),
        ]),
      ),
  })
  .transform(({ name, slug, ...rest }) => ({
    name,
    slug: slugify(slug?.trim() ? slug : name),
    ...rest,
  }))
  .pipe(
    z.object({
      name: z.string(),
      slug: z
        .string()
        .regex(SLUG_PATTERN, "Use letters or numbers in the workspace name or URL."),
      niche: z.string(),
      goals: z.string(),
      tone: z.string(),
      primary_url: z.string(),
    }),
  );
