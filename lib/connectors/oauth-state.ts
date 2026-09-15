import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

type StatePayload = {
  state: string;
  workspaceId: string;
  userId: string;
  platform: string;
  exp: number;
};

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
  input: { workspaceId: string; userId: string; platform: string },
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
): { workspaceId: string } | null {
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

  return { workspaceId: payload.workspaceId };
}
