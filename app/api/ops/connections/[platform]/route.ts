import { NextResponse, type NextRequest } from "next/server";

import { isOwner } from "@/lib/auth/session";
import { getOpsSession } from "@/lib/auth/session";
import {
  CONNECT_RETURN_COOKIE,
  CONNECT_RETURN_INSTANT,
  createOAuthState,
  createPkcePair,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
} from "@/lib/connectors/oauth-state";
import { configurationHint } from "@/lib/connectors/configured";
import { linkedInAuthorizationUrl } from "@/lib/connectors/linkedin/oauth";
import { metaAuthorizationUrl } from "@/lib/connectors/meta/oauth";
import { tikTokAuthorizationUrl } from "@/lib/connectors/tiktok/oauth";
import { xAuthorizationUrl } from "@/lib/connectors/x/oauth";
import { youTubeAuthorizationUrl } from "@/lib/connectors/youtube/oauth";
import { hasLiveConnector } from "@/lib/connectors/registry";
import { TokenKeyError } from "@/lib/connectors/tokens";
import { requestOrigin } from "@/lib/http/origin";

/**
 * GET /api/ops/connections/:platform — starts an owner's OAuth connect flow
 * (002 T2.3; 006 extends it past LinkedIn, 007 to all six). Browser
 * navigation, so failures
 * redirect back with a readable message rather than returning JSON.
 *
 * The platform list is `lib/connectors/registry`, not a list here: a second
 * list would eventually disagree with the one that decides what may publish,
 * and the disagreement would be discovered by a founder connecting an account
 * that can never post.
 */

function back(request: NextRequest, message: string) {
  // A founder who started from Instant gets their error on Instant's Publish
  // screen; an owner who started in the console stays in the console.
  const fromInstant = request.nextUrl.searchParams.get("from") === CONNECT_RETURN_INSTANT;
  const url = new URL(fromInstant ? "/publish" : "/settings/connections", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

/**
 * The platform's own authorization URL. One switch, so adding a network is a
 * case here and a module under lib/connectors, and nothing else.
 */
function authorizationUrl(
  platform: string,
  input: { state: string; redirectUri: string; pkce: { verifier: string; challenge: string } | null },
): string {
  switch (platform) {
    case "linkedin":
      return linkedInAuthorizationUrl({ state: input.state, redirectUri: input.redirectUri });
    case "x":
      return xAuthorizationUrl({
        state: input.state,
        redirectUri: input.redirectUri,
        challenge: input.pkce!.challenge,
      });
    case "tiktok":
      return tikTokAuthorizationUrl({ state: input.state, redirectUri: input.redirectUri });
    case "youtube":
      return youTubeAuthorizationUrl({ state: input.state, redirectUri: input.redirectUri });
    default:
      // Facebook and Instagram share one Meta login; the platform in the
      // redirect URI is what decides which asset the callback keeps.
      return metaAuthorizationUrl({ state: input.state, redirectUri: input.redirectUri });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const session = await getOpsSession();

  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!isOwner(session.activeWorkspace.role)) {
    return back(request, "Only an owner can connect accounts.");
  }
  if (!hasLiveConnector(platform)) {
    return back(request, `Publishing to ${platform} is not available yet. Drafts still work.`);
  }

  const misconfigured = configurationHint(platform);
  if (misconfigured) return back(request, misconfigured);

  // X requires PKCE. The verifier rides in the signed state cookie; only its
  // hash goes to the platform.
  //
  // TikTok deliberately does not: its own documentation applies PKCE to
  // desktop and mobile and has the web flow rely on the client secret staying
  // server-side plus a state token, which is what the signed cookie below is.
  const pkce = platform === "x" ? createPkcePair() : null;

  let state: string;
  let cookie: string;
  try {
    ({ state, cookie } = createOAuthState({
      workspaceId: session.activeWorkspace.workspaceId,
      userId: session.userId,
      platform,
      ...(pkce ? { verifier: pkce.verifier } : {}),
    }));
  } catch (error) {
    if (error instanceof TokenKeyError) return back(request, error.message);
    throw error;
  }

  const redirectUri = `${await requestOrigin()}/api/ops/connections/${platform}/callback`;

  const authorizeUrl = authorizationUrl(platform, { state, redirectUri, pkce });

  const response = NextResponse.redirect(authorizeUrl);

  // Lax so it survives the top-level redirect back from the platform.
  if (request.nextUrl.searchParams.get("from") === CONNECT_RETURN_INSTANT) {
    response.cookies.set(CONNECT_RETURN_COOKIE, CONNECT_RETURN_INSTANT, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/ops/connections",
      maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    });
  }

  response.cookies.set(OAUTH_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/ops/connections",
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
  });

  return response;
}
