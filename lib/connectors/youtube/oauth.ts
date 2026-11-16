import "server-only";

import { ConnectorError } from "@/lib/connectors/errors";

/**
 * YouTube OAuth 2.0, via Google's web-server flow (007 T-4).
 *
 * Verified against Google's OAuth 2.0 and YouTube Data API reference on
 * 2026-11-16. Two details decide whether this connector works at all:
 *
 *   1. **`access_type=offline` plus `prompt=consent`.** Google returns a
 *      refresh token only when offline access was asked for, and — this is the
 *      part that bites — only on the *first* authorization for that user and
 *      client. A founder who reconnects would otherwise get an access token
 *      good for an hour and no way to renew it, and every scheduled upload
 *      after that would fail. `prompt=consent` forces a fresh grant, and
 *      therefore a fresh refresh token, every time.
 *
 *   2. **Two scopes, not one.** `youtube.upload` is what uploads a video. It is
 *      not documented as sufficient for reading the channel list, and the
 *      connection confirmation has to be able to name the channel, so
 *      `youtube.readonly` is requested as well rather than hoping.
 *
 * Unlike TikTok and X, Google's refresh token does *not* rotate: a refresh
 * returns a new access token and usually no refresh token at all, so the stored
 * one is kept. `freshAccessToken` in the executor relies on that.
 */

export const YOUTUBE_SCOPES = [
  // Upload a video as this channel. This is the publish scope.
  "https://www.googleapis.com/auth/youtube.upload",
  // Read the channel's own name and id, so the confirmation can say which
  // channel was connected rather than showing an opaque id.
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

type Env = Record<string, string | undefined>;

export function isYouTubeConfigured(env: Env = process.env): boolean {
  return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
}

function config(env: Env) {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new ConnectorError(
      "misconfigured",
      "YouTube is not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.",
    );
  }
  return { clientId: env.YOUTUBE_CLIENT_ID, clientSecret: env.YOUTUBE_CLIENT_SECRET };
}

export function youTubeAuthorizationUrl(
  input: { state: string; redirectUri: string },
  env: Env = process.env,
): string {
  const { clientId } = config(env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state: input.state,
    // See the note at the top: without both of these there is no refresh token
    // on a reconnect, and scheduled uploads die an hour later.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type YouTubeTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
};

type TokenBody = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeYouTubeCode(
  input: { code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<YouTubeTokens> {
  const { clientId, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach Google to finish connecting.");
  }

  const body = (await response.json().catch(() => ({}))) as TokenBody;

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    throw new ConnectorError("rejected", `Google did not issue a token: ${detail}`);
  }

  if (!body.refresh_token) {
    // Worth refusing rather than storing: a connection with no refresh token
    // works for an hour and then fails every scheduled upload, which is a worse
    // outcome than being told now that the grant needs redoing.
    throw new ConnectorError(
      "rejected",
      "Google did not return a refresh token, so this connection would stop working within the hour. Remove this app from the Google account's third-party access and connect again.",
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    scopes: (body.scope ?? YOUTUBE_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
  };
}

/**
 * Refreshes a YouTube access token (007 T-4).
 *
 * Google's access tokens last about an hour, so a scheduled upload nearly
 * always needs this. The refresh token is long-lived and does not rotate, so
 * when Google returns no new one the stored one stays valid — the caller keeps
 * what it had rather than writing null over a working credential.
 */
export async function refreshYouTubeToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<YouTubeTokens> {
  const { clientId, clientSecret } = config(env);

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach Google to refresh the connection.");
  }

  const body = (await response.json().catch(() => ({}))) as TokenBody;

  if (!response.ok || !body.access_token) {
    // `invalid_grant` is the common one: the grant was revoked, or the refresh
    // token expired because the app is still unverified.
    throw new ConnectorError(
      "token_revoked",
      `Google would not refresh the connection${body.error_description ? `: ${body.error_description}` : "."} Reconnect the channel.`,
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
    scopes: (body.scope ?? YOUTUBE_SCOPES.join(" ")).split(/[\s,]+/).filter(Boolean),
  };
}

/**
 * The channel this token publishes as.
 *
 * Strict, unlike TikTok's identity call: the channel id *is* the publish
 * target, and a Google account with no YouTube channel can authorize
 * perfectly well and then have nowhere to upload to. Telling the founder that
 * now is much better than at publish time.
 */
export async function fetchYouTubeChannel(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ externalAccountId: string; displayName: string }> {
  let response: Response;
  try {
    response = await fetchImpl(`${CHANNELS_URL}?part=snippet&mine=true`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ConnectorError("unavailable", "Could not reach YouTube to read the channel.");
  }

  if (response.status === 401) {
    throw new ConnectorError("token_revoked", "YouTube rejected the new token.");
  }

  const body = (await response.json().catch(() => ({}))) as {
    items?: { id?: string; snippet?: { title?: string } }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new ConnectorError(
      "rejected",
      `YouTube would not return the channel: ${body.error?.message ?? `HTTP ${response.status}`}`,
    );
  }

  const channel = body.items?.[0];
  if (!channel?.id) {
    throw new ConnectorError(
      "rejected",
      "This Google account has no YouTube channel, so there is nothing to publish to. Create a channel on YouTube and connect again.",
    );
  }

  return {
    externalAccountId: channel.id,
    displayName: channel.snippet?.title
      ? `${channel.snippet.title} (YouTube)`
      : "YouTube channel",
  };
}
