import "server-only";

import { ConnectorError } from "@/lib/connectors/errors";

/**
 * Meta OAuth for Facebook Pages and Instagram (006 T-1).
 *
 * One flow serves both platforms, because Meta only has one: a person logs in
 * with Facebook, and what comes back is a *user* token. Everything a product
 * actually publishes to hangs off that — a Page is reached with a Page token
 * derived from it, and an Instagram professional account is reached only
 * through the Page it is linked to. There is no Instagram-only login.
 *
 * So `platform` here decides which asset we keep, not which login we run:
 *
 *   facebook  → the Page's id, with the Page's own access token
 *   instagram → the IG professional account's id, with that same Page token
 *
 * Both rows therefore hold a Page token, which is the thing Meta actually
 * authorises. A workspace that connects both ends up with two
 * `connected_accounts` rows sharing a credential, which is correct: revoking
 * the Page revokes both, and that is exactly what Meta does.
 *
 * Token lifetimes: the code exchange returns a short-lived user token (~1 hour).
 * It is immediately exchanged for a long-lived one (~60 days), and Page tokens
 * derived from a long-lived user token do not expire on their own — they die
 * when the user changes their password, revokes the app, or loses the Page.
 * That is why `expires_at` is stored from the long-lived user token: it is the
 * honest outer bound, and an expired row tells the founder to reconnect rather
 * than letting a publish fail at the platform.
 */

const GRAPH_VERSION = "v21.0";
const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Scopes, and why each one is here. Meta reviews these individually, so asking
 * for one we do not use is a review risk for no gain.
 *
 *   pages_show_list          list the Pages this person manages, to pick one
 *   pages_read_engagement    read the Page's name and linked IG account
 *   pages_manage_posts       create posts on the Page
 *   instagram_basic          read the IG professional account behind the Page
 *   instagram_content_publish publish a container to that IG account
 *   business_management      reach Pages owned by a Business, not just personal ones
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
] as const;

export type MetaPlatform = "facebook" | "instagram";

type Env = Record<string, string | undefined>;

export function isMetaConfigured(env: Env = process.env): boolean {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET);
}

function config(env: Env) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new ConnectorError(
      "misconfigured",
      "Meta is not configured. Set META_APP_ID and META_APP_SECRET.",
    );
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

export function metaAuthorizationUrl(
  input: { state: string; redirectUri: string },
  env: Env = process.env,
): string {
  const { appId } = config(env);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `${DIALOG_URL}?${params.toString()}`;
}

export type MetaConnection = {
  /** The Page id, or the IG professional account id, per `platform`. */
  externalAccountId: string;
  displayName: string;
  /** Always the Page access token: the credential Meta actually authorises. */
  accessToken: string;
  /** From the long-lived USER token — the outer bound on the Page token. */
  expiresAt: Date | null;
  scopes: string[];
};

type GraphError = { error?: { message?: string; type?: string; code?: number } };

async function graph<T>(
  url: string,
  fetchImpl: typeof fetch,
  what: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new ConnectorError("unavailable", `Could not reach Meta to ${what}.`);
  }

  const body = (await response.json().catch(() => ({}))) as T & GraphError;

  if (!response.ok || body.error) {
    const detail = body.error?.message ? `: ${body.error.message}` : ".";
    if (response.status === 401 || body.error?.code === 190) {
      throw new ConnectorError("token_revoked", `Meta rejected the token${detail}`);
    }
    if (response.status >= 500) {
      throw new ConnectorError("unavailable", `Meta returned ${response.status}${detail}`);
    }
    throw new ConnectorError("rejected", `Meta refused to ${what}${detail}`);
  }

  return body;
}

/**
 * Code → short-lived user token → long-lived user token.
 *
 * The second hop is not optional. Without it the connection dies about an hour
 * after the founder makes it, which in practice means every scheduled post
 * fails and nobody knows why until they read a job error.
 */
export async function exchangeMetaCode(
  input: { code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
  now: number = Date.now(),
): Promise<{ userToken: string; expiresAt: Date | null }> {
  const { appId, appSecret } = config(env);

  const shortLived = await graph<{ access_token?: string }>(
    `${GRAPH_URL}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: input.redirectUri,
        code: input.code,
      }),
    fetchImpl,
    "finish connecting",
  );

  if (!shortLived.access_token) {
    throw new ConnectorError("rejected", "Meta did not issue an access token.");
  }

  const longLived = await graph<{ access_token?: string; expires_in?: number }>(
    `${GRAPH_URL}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.access_token,
      }),
    fetchImpl,
    "extend the connection",
  );

  const token = longLived.access_token ?? shortLived.access_token;
  return {
    userToken: token,
    expiresAt: longLived.expires_in ? new Date(now + longLived.expires_in * 1000) : null,
  };
}

type PageRow = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
};

/**
 * Picks the asset to connect for `platform`.
 *
 * `pageId` names which Page when the person manages several; without it the
 * first Page is used, and the display name tells them which one they got. A
 * person with no Page at all gets a sentence saying so rather than a generic
 * refusal — creating a Page is a thing they can go and do.
 */
export async function fetchMetaConnection(
  input: { userToken: string; platform: MetaPlatform; pageId?: string; expiresAt: Date | null },
  fetchImpl: typeof fetch = fetch,
): Promise<MetaConnection> {
  const accounts = await graph<{ data?: PageRow[] }>(
    `${GRAPH_URL}/me/accounts?` +
      new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        access_token: input.userToken,
      }),
    fetchImpl,
    "read your Pages",
  );

  const pages = accounts.data ?? [];
  if (pages.length === 0) {
    throw new ConnectorError(
      "rejected",
      "This Facebook account manages no Pages. Create a Page (and, for Instagram, link a professional account to it) and connect again.",
    );
  }

  const page = input.pageId ? pages.find((row) => row.id === input.pageId) : pages[0];
  if (!page) {
    throw new ConnectorError("rejected", "That Page is not one this account manages.");
  }
  if (!page.access_token) {
    throw new ConnectorError(
      "rejected",
      `Meta returned no access token for ${page.name ?? "that Page"}. Check the app has pages_manage_posts.`,
    );
  }

  if (input.platform === "facebook") {
    return {
      externalAccountId: page.id,
      displayName: page.name ?? "Facebook Page",
      accessToken: page.access_token,
      expiresAt: input.expiresAt,
      scopes: [...META_SCOPES],
    };
  }

  const instagram = page.instagram_business_account;
  if (!instagram?.id) {
    throw new ConnectorError(
      "rejected",
      `${page.name ?? "That Page"} has no Instagram professional account linked to it. Link one in Meta Business settings, then connect again.`,
    );
  }

  return {
    externalAccountId: instagram.id,
    displayName: instagram.username ? `@${instagram.username}` : "Instagram account",
    accessToken: page.access_token,
    expiresAt: input.expiresAt,
    scopes: [...META_SCOPES],
  };
}
