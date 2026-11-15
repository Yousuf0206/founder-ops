import "server-only";

import { ConnectorError } from "@/lib/connectors/errors";

/**
 * X OAuth 2.0 with PKCE (006 T-3).
 *
 * X issues user-context tokens only through OAuth 2.0 with PKCE — there is no
 * client-credentials path to posting as someone. The verifier lives in the
 * signed state cookie (lib/connectors/oauth-state.ts); only its S256 hash
 * reaches X.
 *
 * `offline.access` is what buys a refresh token. Without it the connection
 * dies in two hours and every scheduled post after that fails, so it is not
 * optional for anything that publishes later than "now".
 *
 * Posting requires a paid API tier. The free tier can read and can authenticate
 * perfectly well, and then refuses POST /2/tweets — which is why a 403 here is
 * reported as a plan problem in plain words rather than as a generic refusal.
 */

export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";

type Env = Record<string, string | undefined>;

export function isXConfigured(env: Env = process.env): boolean {
  return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
}

function config(env: Env) {
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) {
    throw new ConnectorError("misconfigured", "X is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET.");
  }
  return { clientId: env.X_CLIENT_ID, clientSecret: env.X_CLIENT_SECRET };
}

export function xAuthorizationUrl(
  input: { state: string; redirectUri: string; challenge: string },
  env: Env = process.env,
): string {
  const { clientId } = config(env);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: X_SCOPES.join(" "),
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type XTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
};

export async function exchangeXCode(
  input: { code: string; redirectUri: string; verifier: string },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<XTokens> {
  const { clientId, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // A confidential client authenticates with Basic here, and ALSO sends
        // the verifier: X checks both.
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach X to finish connecting.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    throw new ConnectorError("rejected", `X did not issue a token: ${detail}`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    scopes: (body.scope ?? X_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
  };
}

/**
 * Refreshes an X access token (006 T-3).
 *
 * X access tokens last about two hours, so unlike LinkedIn this connector
 * cannot treat the stored token as good for the life of the connection. The
 * refresh token rotates on every use: the NEW one must be stored, or the next
 * refresh fails and the founder is asked to reconnect for no reason.
 */
export async function refreshXToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<XTokens> {
  const { clientId, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach X to refresh the connection.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new ConnectorError(
      "token_revoked",
      `X would not refresh the connection${body.error_description ? `: ${body.error_description}` : "."} Reconnect the account.`,
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    scopes: (body.scope ?? X_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
  };
}

export async function fetchXIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalAccountId: string; displayName: string }> {
  let response: Response;
  try {
    response = await fetchImpl(ME_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach X to read the account.");
  }

  if (response.status === 401) {
    throw new ConnectorError("token_revoked", "X rejected the new token.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    data?: { id?: string; username?: string; name?: string };
  };

  if (!response.ok || !body.data?.id) {
    throw new ConnectorError("rejected", "X did not return the account identity.");
  }

  return {
    externalAccountId: body.data.id,
    displayName: body.data.username ? `@${body.data.username}` : (body.data.name ?? "X account"),
  };
}
