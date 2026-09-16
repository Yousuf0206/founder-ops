import "server-only";

import { Resend } from "resend";

import { createSupabaseAdminClient } from "@/lib/db/server";
import { EmailNotConfiguredError, isEmailConfigured } from "@/lib/email/notify";

/**
 * Password-reset email sent through Resend instead of Supabase's mailer.
 *
 * The link is built here, so it always points at this app's /auth/callback
 * with a `token_hash` — it works on any device and does not depend on the
 * Supabase dashboard's Site URL, Redirect URLs, or email template.
 *
 * Only ever sent to the address of the account being reset.
 */

/** Minimum gap between reset emails to one account, so the form cannot spam it. */
const COOLDOWN_MS = 60_000;

export type ResetEmailResult = "sent" | "no_account" | "cooldown";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes LIKE wildcards so an email is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Sends a reset email if an account exists for `email`.
 *
 * Returns why nothing was sent rather than throwing, so the caller can show
 * the same response either way and not reveal which emails are registered.
 * Throws only on real failures (Supabase or Resend errors).
 */
export async function sendPasswordResetEmail(
  email: string,
  siteOrigin: string,
): Promise<ResetEmailResult> {
  if (!isEmailConfigured()) throw new EmailNotConfiguredError();

  const admin = createSupabaseAdminClient();

  // Look the account up before generating a link: generating one invalidates
  // the previous token, which would break a link we sent seconds ago.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", escapeLike(email))
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return "no_account";

  const { data: found, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError) throw userError;

  const appMetadata = found.user.app_metadata ?? {};
  const lastSent = Date.parse(String(appMetadata.password_reset_sent_at ?? ""));
  if (Number.isFinite(lastSent) && Date.now() - lastSent < COOLDOWN_MS) return "cooldown";

  // generateLink creates the recovery token but sends nothing itself.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkError) throw linkError;

  const url =
    `${siteOrigin}/auth/callback` +
    `?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: process.env.NOTIFY_FROM_EMAIL!,
    to: [email],
    subject: "Reset your Founder Ops password",
    text: [
      "Someone asked to reset the password for your Founder Ops account.",
      "",
      `Choose a new password: ${url}`,
      "",
      "The link expires in one hour and can only be used once.",
      "If you did not request this, ignore this email. Your password will not change.",
    ].join("\n"),
    html: [
      "<h2>Reset your Founder Ops password</h2>",
      "<p>Someone asked to reset the password for your Founder Ops account.</p>",
      `<p><a href="${escapeHtml(url)}">Choose a new password</a></p>`,
      "<p>The link expires in one hour and can only be used once.</p>",
      "<p>If you did not request this, ignore this email. Your password will not change.</p>",
    ].join(""),
  });
  if (sendError) throw new Error(`Password reset email failed: ${sendError.message}`);

  await admin.auth.admin.updateUserById(profile.id, {
    app_metadata: { ...appMetadata, password_reset_sent_at: new Date().toISOString() },
  });

  return "sent";
}
