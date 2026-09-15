import { NextResponse, type NextRequest } from "next/server";

import { getOpsSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { ConnectorError } from "@/lib/connectors/errors";
import { exchangeLinkedInCode, fetchLinkedInIdentity } from "@/lib/connectors/linkedin/oauth";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/connectors/oauth-state";
import { encryptToken, TokenKeyError, tokenContext } from "@/lib/connectors/tokens";
import { requestOrigin } from "@/lib/http/origin";

/**
 * GET /api/ops/connections/:platform/callback (002 T2.3, US2 AC1, NFR-005).
 *
 *   1. state must match a cookie this server signed for this user and platform
 *   2. exchange the code, read the account identity
 *   3. seal the tokens (AES-256-GCM) before they leave this function
 *   4. store via upsert_connected_account(), which checks the caller owns the
 *      workspace named in the SIGNED cookie — never one named in the query
 */

function finish(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/connections", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/ops/connections" });
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

  if (platform !== "linkedin") {
    return finish(request, { error: `Publishing to ${platform} is not available yet.` });
  }

  let verified: { workspaceId: string } | null;
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
    const tokens = await exchangeLinkedInCode({ code, redirectUri });
    const identity = await fetchLinkedInIdentity(tokens.accessToken);

    const context = tokenContext(verified.workspaceId, platform, identity.externalAccountId);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("upsert_connected_account", {
      p_workspace: verified.workspaceId,
      p_platform: platform,
      p_external_account_id: identity.externalAccountId,
      p_display_name: identity.displayName,
      p_scopes: tokens.scopes,
      p_access_token_encrypted: encryptToken(tokens.accessToken, context),
      p_refresh_token_encrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken, context) : null,
      p_expires_at: tokens.expiresAt?.toISOString() ?? null,
      p_refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
    });

    if (error) {
      return finish(request, {
        error: /only an owner/i.test(error.message)
          ? "Only an owner of that workspace can connect accounts."
          : "The account could not be saved. Try again.",
      });
    }

    return finish(request, { connected: identity.displayName || "LinkedIn account" });
  } catch (error) {
    if (error instanceof ConnectorError || error instanceof TokenKeyError) {
      return finish(request, { error: error.message });
    }
    console.error(error);
    return finish(request, { error: "Connecting failed unexpectedly. Try again." });
  }
}
