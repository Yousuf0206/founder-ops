import "server-only";

import { ConnectorError } from "@/lib/connectors/errors";

/**
 * TikTok OAuth 2.0 (007 T-2).
 *
 * Verified against TikTok's Login Kit and token-management reference on
 * 2026-11-16. Three things about it are unlike every other connector here:
 *
 *   1. The client identifier parameter is `client_key`, not `client_id`. Sending
 *      `client_id` fails with an unhelpful error, which is why it is spelled out
 *      rather than shared with the other flows.
 *   2. **No PKCE on web.** TikTok's own documentation applies PKCE to desktop,
 *      iOS and Android, and says the web flow relies on the client secret
 *      staying on the server plus a `state` token. We have a signed, httpOnly,
 *      user-and-platform-bound state cookie, which is that protection done
 *      properly, so nothing is lost by following the documented web flow.
 *   3. The access token lasts about **two hours** and the refresh token
 *      **rotates on every use** — the old one stops working immediately. Both
 *      facts are X's situation again, and they are why `refreshTikTokToken`
 *      exists and why its result must be stored before it is used.
 *
 * `open_id` from the token response is the account identity TikTok documents,
 * so it is what gets stored as the external account id. The display name is a
 * separate, optional call: a connection that works but cannot be named is still
 * a working connection, so a failure there degrades to the handle TikTok gave us
 * rather than refusing the whole connect.
 */

/**
 * Scopes, and why each one is here.
 *
 *   user.info.basic  read the account's display name, so a founder can see
 *                    which account they connected rather than an opaque id
 *   video.publish    direct post — this is the scope that actually publishes,
 *                    for photos as well as video (video.upload is the
 *                    draft-to-inbox flow, which this product does not use)
 */
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

type Env = Record<string, string | undefined>;

export function isTikTokConfigured(env: Env = process.env): boolean {
  return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
}

function config(env: Env) {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    throw new ConnectorError(
      "misconfigured",
      "TikTok is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.",
    );
  }
  return { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET };
}

export function tikTokAuthorizationUrl(
  input: { state: string; redirectUri: string },
  env: Env = process.env,
): string {
  const { clientKey } = config(env);
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type TikTokTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  openId: string;
  scopes: string[];
};

type TokenBody = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function tokensFrom(body: TokenBody, now: number): TikTokTokens {
  return {
    accessToken: body.access_token!,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    refreshExpiresAt: body.refresh_expires_in
      ? new Date(now + body.refresh_expires_in * 1000)
      : null,
    openId: body.open_id ?? "",
    // TikTok returns scopes comma-separated, not space-separated.
    scopes: (body.scope ?? TIKTOK_SCOPES.join(",")).split(/[\s,]+/).filter(Boolean),
  };
}

export async function exchangeTikTokCode(
  input: { code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<TikTokTokens> {
  const { clientKey, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach TikTok to finish connecting.");
  }

  const body = (await response.json().catch(() => ({}))) as TokenBody;

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    throw new ConnectorError("rejected", `TikTok did not issue a token: ${detail}`);
  }
  if (!body.open_id) {
    throw new ConnectorError(
      "rejected",
      "TikTok issued a token without an account id, so there is no account to publish to.",
    );
  }

  return tokensFrom(body, now);
}

/**
 * Refreshes a TikTok access token (007 T-2).
 *
 * The rotation matters more here than anywhere else: TikTok invalidates the old
 * refresh token the moment this succeeds, so if the new one is not stored, the
 * connection is dead and the founder is told to reconnect an account that was
 * healthy five minutes ago. `freshAccessToken` in the executor stores it before
 * the publish for exactly that reason.
 */
export async function refreshTikTokToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<TikTokTokens> {
  const { clientKey, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach TikTok to refresh the connection.");
  }

  const body = (await response.json().catch(() => ({}))) as TokenBody;

  if (!response.ok || !body.access_token) {
    throw new ConnectorError(
      "token_revoked",
      `TikTok would not refresh the connection${body.error_description ? `: ${body.error_description}` : "."} Reconnect the account.`,
    );
  }

  return tokensFrom(body, now);
}

/**
 * The account's display name, for the confirmation a founder reads.
 *
 * Deliberately forgiving: the identity that matters (`open_id`) already came
 * back with the token, so a failure here costs a nicer label and nothing else.
 * Refusing the connection over it would be the wrong trade.
 */
export async function fetchTikTokIdentity(
  tokens: { accessToken: string; openId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalAccountId: string; displayName: string }> {
  const fallback = {
    externalAccountId: tokens.openId,
    displayName: "TikTok account",
  };

  let response: Response;
  try {
    response = await fetchImpl(`${USER_INFO_URL}?fields=open_id,display_name`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
  } catch {
    return fallback;
  }

  // A revoked token here is worth surfacing: it means the token we just
  // received is already unusable, which is not a cosmetic problem.
  if (response.status === 401) {
    throw new ConnectorError("token_revoked", "TikTok rejected the new token.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    data?: { user?: { open_id?: string; display_name?: string } };
  };

  const user = body.data?.user;
  if (!response.ok || !user) return fallback;

  return {
    externalAccountId: user.open_id || tokens.openId,
    displayName: user.display_name ? `${user.display_name} (TikTok)` : fallback.displayName,
  };
}
