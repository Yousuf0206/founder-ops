import { NextResponse, type NextRequest } from "next/server";

import { isOwner } from "@/lib/auth/session";
import { getOpsSession } from "@/lib/auth/session";
import { createOAuthState, OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS } from "@/lib/connectors/oauth-state";
import { isLinkedInConfigured, linkedInAuthorizationUrl } from "@/lib/connectors/linkedin/oauth";
import { TokenKeyError } from "@/lib/connectors/tokens";
import { requestOrigin } from "@/lib/http/origin";

/**
 * GET /api/ops/connections/:platform — starts an owner's OAuth connect flow
 * (002 T2.3, US2 AC1–AC2). Browser navigation, so failures redirect back to the
 * connections page with a readable message rather than returning JSON.
 */

function back(request: NextRequest, message: string) {
  const url = new URL("/settings/connections", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const session = await getOpsSession();

  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!isOwner(session.activeWorkspace.role)) {
    return back(request, "Only an owner can connect accounts.");
  }
  if (platform !== "linkedin") {
    return back(request, `Publishing to ${platform} is not available yet. Drafts still work.`);
  }
  if (!isLinkedInConfigured()) {
    return back(
      request,
      "LinkedIn is not configured on the server. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_API_VERSION.",
    );
  }

  let state: string;
  let cookie: string;
  try {
    ({ state, cookie } = createOAuthState({
      workspaceId: session.activeWorkspace.workspaceId,
      userId: session.userId,
      platform,
    }));
  } catch (error) {
    if (error instanceof TokenKeyError) return back(request, error.message);
    throw error;
  }

  const redirectUri = `${await requestOrigin()}/api/ops/connections/${platform}/callback`;
  const response = NextResponse.redirect(linkedInAuthorizationUrl({ state, redirectUri }));

  // Lax so it survives the top-level redirect back from the platform.
  response.cookies.set(OAUTH_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/ops/connections",
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
  });

  return response;
}
