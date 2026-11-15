import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { loadTokenKey } from "@/lib/connectors/tokens";

/**
 * OAuth `state` for connector flows (002 T2.3) — the CSRF defence.
 *
 * The start route sets a signed, short-lived, httpOnly cookie carrying the
 * random state, the workspace, the user, and the platform; the callback accepts
 * only a returned state matching a cookie this server signed for that same user
 * and platform. The workspace comes from the signed cookie, never the query.
 */

export const OAUTH_STATE_COOKIE = "lumo-ops-oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Where to send the user after a connect round trip (004 T-4.3).
 *
 * The Instant path and the ops console both start the same OAuth flow, and the
 * founder in Instant must not be dropped into the ops shell on the way back.
 * This cookie carries that one bit.
 *
 * It is NOT a redirect target and never holds a URL: the callback accepts only
 * the literal value below and chooses between two hardcoded paths, so there is
 * nothing here an attacker could point somewhere else. It is unsigned for the
 * same reason — the worst a forged value can do is land the user on a different
 * page of this app.
 */
export const CONNECT_RETURN_COOKIE = "lumo-ops-connect-return";
export const CONNECT_RETURN_INSTANT = "instant";

type StatePayload = {
  state: string;
  workspaceId: string;
  userId: string;
  platform: string;
  exp: number;
  /**
   * PKCE code verifier, for platforms that require it (X). It rides in the same
   * signed cookie as the state because it has the same lifetime and the same
   * secrecy requirement: it must reach the callback, must not reach the
   * platform, and is worthless once the code is exchanged. Optional, so a
   * cookie written before PKCE existed still verifies.
   */
  verifier?: string;
};

/**
 * A PKCE pair (RFC 7636, S256).
 *
 * The verifier stays in the signed state cookie; only its hash travels to the
 * platform, so an intercepted authorization code cannot be exchanged by anyone
 * who did not start the flow. X requires this even for confidential clients.
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

function signingKey(key?: Buffer): Buffer {
  // Derived, so the token encryption key itself is never used as an HMAC key.
  return createHmac("sha256", key ?? loadTokenKey()).update("oauth-state-v1").digest();
}

function sign(body: string, key?: Buffer): string {
  return createHmac("sha256", signingKey(key)).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createOAuthState(
  input: { workspaceId: string; userId: string; platform: string; verifier?: string },
  options: { now?: number; key?: Buffer } = {},
): { state: string; cookie: string } {
  const state = randomBytes(24).toString("base64url");
  const payload: StatePayload = {
    state,
    ...input,
    exp: (options.now ?? Date.now()) + OAUTH_STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state, cookie: `${body}.${sign(body, options.key)}` };
}

export function verifyOAuthState(
  cookie: string | undefined,
  returnedState: string | null,
  expected: { userId: string; platform: string },
  options: { now?: number; key?: Buffer } = {},
): { workspaceId: string; verifier?: string } | null {
  if (!cookie || !returnedState) return null;

  const [body, signature, ...rest] = cookie.split(".");
  if (!body || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, sign(body, options.key))) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }

  if (!safeEqual(payload.state, returnedState)) return null;
  if (payload.exp < (options.now ?? Date.now())) return null;
  if (payload.userId !== expected.userId || payload.platform !== expected.platform) return null;

  return { workspaceId: payload.workspaceId, verifier: payload.verifier };
}
