import { z } from "zod";

/**
 * Boundary validation for sign-in, sign-up, and password management.
 *
 * Supabase hashes passwords with bcrypt, which silently ignores bytes past 72,
 * so the upper bound is enforced here rather than letting a long password
 * appear to work while only its prefix matters.
 */

const email = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email("Enter a valid email address.").max(320));

const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.");

const passwordsMatch = (value: { password: string; confirm: string }) =>
  value.password === value.confirm;
const mismatch = { message: "Passwords do not match.", path: ["confirm"] };

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72),
});

export const createAccountSchema = z.object({ email, password: newPassword });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine(passwordsMatch, mismatch);

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(72),
    password: newPassword,
    confirm: z.string(),
  })
  .refine(passwordsMatch, mismatch);

/** Only ever redirect to a path on this origin. */
export function safeNextPath(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/";
}

/** First validation message, for display on the form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
