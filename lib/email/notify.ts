import "server-only";

import { Resend } from "resend";

/**
 * The only outbound message path in this product (T4.4, T4.7).
 *
 * Constitution IV bars cold outreach and bulk messaging. This module therefore
 * exposes exactly one function, it takes no recipient list, and its single
 * recipient is resolved from the workspace's own notify address — never from a
 * lead record. There is no code path from a lead's email to a send.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured. Set RESEND_API_KEY and NOTIFY_FROM_EMAIL.");
    this.name = "EmailNotConfiguredError";
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

/**
 * Notifies one workspace member. `to` must be a team address that the caller
 * read from the workspace, not from any inbound payload.
 */
export async function notifyTeamMember(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (!isEmailConfigured()) throw new EmailNotConfiguredError();

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.NOTIFY_FROM_EMAIL!,
    to: [input.to],
    subject: input.subject,
    text: input.body,
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
}
