import "server-only";

import { ConnectorError } from "@/lib/connectors/errors";

/**
 * LinkedIn OAuth 2.0 authorization-code flow (002 T2.3, FR-P-001).
 *
 * B2 is open. This implements posting as the member who connects, using the
 * "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products:
 * scopes `openid profile w_member_social`. Organization page posting needs
 * `w_organization_social` and Community Management API access, and is not
 * built until B2 says it is wanted.
 */

export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

type Env = Record<string, string | undefined>;

export function isLinkedInConfigured(env: Env = process.env): boolean {
  return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.LINKEDIN_API_VERSION);
}

function config(env: Env) {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new ConnectorError(
      "misconfigured",
      "LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.",
    );
  }
  return { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET };
}

export function linkedInAuthorizationUrl(
  input: { state: string; redirectUri: string },
  env: Env = process.env,
): string {
  const { clientId } = config(env);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: LINKEDIN_SCOPES.join(" "),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type LinkedInTokens = {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
};

export async function exchangeLinkedInCode(
  input: { code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<LinkedInTokens> {
  const { clientId, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach LinkedIn to finish connecting.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new ConnectorError(
      "rejected",
      `LinkedIn did not issue a token${body.error_description ? `: ${body.error_description}` : "."}`,
    );
  }

  return {
    accessToken: body.access_token,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    refreshToken: body.refresh_token ?? null,
    refreshExpiresAt: body.refresh_token_expires_in
      ? new Date(now + body.refresh_token_expires_in * 1000)
      : null,
    scopes: (body.scope ?? LINKEDIN_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
  };
}

/** The member's stable id (`sub`) becomes the account's external id and post author. */
export async function fetchLinkedInIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalAccountId: string; displayName: string }> {
  let response: Response;
  try {
    response = await fetchImpl(USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach LinkedIn to read the account.");
  }

  if (response.status === 401) {
    throw new ConnectorError("token_revoked", "LinkedIn rejected the new token.");
  }

  const body = (await response.json().catch(() => ({}))) as { sub?: string; name?: string };
  if (!response.ok || !body.sub) {
    throw new ConnectorError("rejected", "LinkedIn did not return the account identity.");
  }

  return { externalAccountId: body.sub, displayName: body.name ?? "" };
}
