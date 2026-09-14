import { z } from "zod";

/**
 * Boundary validation for self-serve workspace creation.
 *
 * Mirrors the database checks on `workspaces` (name 1–120 chars after trim,
 * slug `^[a-z0-9]+(-[a-z0-9]+)*$`) so a bad submission fails with a readable
 * message instead of a constraint violation.
 */

/** Each signed-up user may own this many workspaces (Constitution VIII: caps). */
export const MAX_OWNED_WORKSPACES = 3;

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

export const workspaceCreateSchema = z
  .object({
    name: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Enter a workspace name.").max(120)),
    // Optional: derived from the name when left blank.
    slug: z.string().nullish(),
  })
  .transform(({ name, slug }) => ({
    name,
    slug: slugify(slug?.trim() ? slug : name),
  }))
  .pipe(
    z.object({
      name: z.string(),
      slug: z
        .string()
        .regex(SLUG_PATTERN, "Use letters or numbers in the workspace name or URL."),
    }),
  );
