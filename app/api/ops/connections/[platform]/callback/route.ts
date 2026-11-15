import { NextResponse, type NextRequest } from "next/server";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { ConnectorError } from "@/lib/connectors/errors";
import { exchangeLinkedInCode, fetchLinkedInIdentity } from "@/lib/connectors/linkedin/oauth";
import { exchangeMetaCode, fetchMetaConnection, type MetaPlatform } from "@/lib/connectors/meta/oauth";
import { exchangeXCode, fetchXIdentity } from "@/lib/connectors/x/oauth";
import { hasLiveConnector } from "@/lib/connectors/registry";
import {
  CONNECT_RETURN_COOKIE,
  CONNECT_RETURN_INSTANT,
  OAUTH_STATE_COOKIE,
  verifyOAuthState,
} from "@/lib/connectors/oauth-state";
import { encryptToken, TokenKeyError, tokenContext } from "@/lib/connectors/tokens";
import { requestOrigin } from "@/lib/http/origin";

/**
 * GET /api/ops/connections/:platform/callback (002 T2.3; 006 adds Meta and X).
 *
 *   1. state must match a cookie this server signed for this user and platform
 *   2. exchange the code, read the account identity
 *   3. seal the tokens (AES-256-GCM) before they leave this function
 *   4. store via upsert_connected_account(), which checks the caller owns the
 *      workspace named in the SIGNED cookie — never one named in the query
 *
 * Step 2 is the only part that differs per platform, and it is isolated in
 * `connect()` below. Everything that protects the user — the state check, the
 * sealing, the ownership check — happens once, for every platform, here.
 */

type Connection = {
  externalAccountId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
};

async function connect(
  platform: string,
  input: { code: string; redirectUri: string; verifier?: string },
): Promise<Connection> {
  if (platform === "linkedin") {
    const tokens = await exchangeLinkedInCode({ code: input.code, redirectUri: input.redirectUri });
    const identity = await fetchLinkedInIdentity(tokens.accessToken);
    return {
      ...identity,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      scopes: tokens.scopes,
    };
  }

  if (platform === "facebook" || platform === "instagram") {
    const { userToken, expiresAt } = await exchangeMetaCode({
      code: input.code,
      redirectUri: input.redirectUri,
    });
    const connection = await fetchMetaConnection({
      userToken,
      platform: platform as MetaPlatform,
      expiresAt,
    });
    return {
      externalAccountId: connection.externalAccountId,
      displayName: connection.displayName,
      // The PAGE token is stored, not the user token: it is what publishing
      // uses, and it is the narrower of the two.
      accessToken: connection.accessToken,
      refreshToken: null,
      expiresAt: connection.expiresAt,
      refreshExpiresAt: null,
      scopes: connection.scopes,
    };
  }

  if (platform === "x") {
    if (!input.verifier) {
      throw new ConnectorError("rejected", "The connection request was missing its PKCE verifier. Start again.");
    }
    const tokens = await exchangeXCode({
      code: input.code,
      redirectUri: input.redirectUri,
      verifier: input.verifier,
    });
    const identity = await fetchXIdentity(tokens.accessToken);
    return {
      ...identity,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      refreshExpiresAt: null,
      scopes: tokens.scopes,
    };
  }

  throw new ConnectorError("misconfigured", `There is no connect flow for ${platform}.`);
}

function finish(request: NextRequest, params: Record<string, string>) {
  // Two literal destinations, chosen by the cookie the start route set: the
  // Instant Publish screen for a founder mid-loop, the ops connections page for
  // an owner in the console. Nothing from the request reaches this path.
  const fromInstant =
    request.cookies.get(CONNECT_RETURN_COOKIE)?.value === CONNECT_RETURN_INSTANT;
  const url = new URL(fromInstant ? "/publish" : "/settings/connections", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/ops/connections" });
  response.cookies.delete({ name: CONNECT_RETURN_COOKIE, path: "/api/ops/connections" });
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const session = await getOpsSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const query = request.nextUrl.searchParams;
  if (query.get("error")) {
    return finish(request, { error: "The connection was cancelled or refused on the platform." });
  }

  if (!hasLiveConnector(platform)) {
    return finish(request, { error: `Publishing to ${platform} is not available yet.` });
  }

  let verified: { workspaceId: string; verifier?: string } | null;
  try {
    verified = verifyOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, query.get("state"), {
      userId: session.userId,
      platform,
    });
  } catch (error) {
    if (error instanceof TokenKeyError) return finish(request, { error: error.message });
    throw error;
  }

  const code = query.get("code");
  if (!verified || !code) {
    return finish(request, { error: "The connection request expired or did not match. Start again." });
  }

  try {
    const redirectUri = `${await requestOrigin()}/api/ops/connections/${platform}/callback`;
    const connection = await connect(platform, {
      code,
      redirectUri,
      ...(verified.verifier ? { verifier: verified.verifier } : {}),
    });

    const context = tokenContext(verified.workspaceId, platform, connection.externalAccountId);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("upsert_connected_account", {
      p_workspace: verified.workspaceId,
      p_platform: platform,
      p_external_account_id: connection.externalAccountId,
      p_display_name: connection.displayName,
      p_scopes: connection.scopes,
      p_access_token_encrypted: encryptToken(connection.accessToken, context),
      p_refresh_token_encrypted: connection.refreshToken
        ? encryptToken(connection.refreshToken, context)
        : null,
      p_expires_at: connection.expiresAt?.toISOString() ?? null,
      p_refresh_expires_at: connection.refreshExpiresAt?.toISOString() ?? null,
    });

    if (error) {
      return finish(request, {
        error: /only an owner/i.test(error.message)
          ? "Only an owner of that workspace can connect accounts."
          : "The account could not be saved. Try again.",
      });
    }

    return finish(request, { connected: connection.displayName || `${platform} account` });
  } catch (error) {
    if (error instanceof ConnectorError || error instanceof TokenKeyError) {
      return finish(request, { error: error.message });
    }
    console.error(error);
    return finish(request, { error: "Connecting failed unexpectedly. Try again." });
  }
}
