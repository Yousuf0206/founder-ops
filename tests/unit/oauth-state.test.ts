import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createOAuthState, OAUTH_STATE_TTL_MS, verifyOAuthState } from "@/lib/connectors/oauth-state";

/** 002 T2.3 — OAuth state is the CSRF defence on the connector callback. */

const key = randomBytes(32);
const input = { workspaceId: "ws-1", userId: "user-1", platform: "linkedin" };
const expected = { userId: "user-1", platform: "linkedin" };

describe("OAuth state", () => {
  it("verifies a state it issued and returns the signed workspace", () => {
    const { state, cookie } = createOAuthState(input, { now: 0, key });
    expect(verifyOAuthState(cookie, state, expected, { now: 1, key })).toEqual({ workspaceId: "ws-1" });
  });

  it("rejects a returned state that does not match the cookie", () => {
    const { cookie } = createOAuthState(input, { now: 0, key });
    expect(verifyOAuthState(cookie, "attacker-state", expected, { now: 1, key })).toBeNull();
  });

  it("rejects a cookie whose workspace was edited", () => {
    const { state, cookie } = createOAuthState(input, { now: 0, key });
    const [body, signature] = cookie.split(".");
    const payload = JSON.parse(Buffer.from(body!, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, workspaceId: "ws-victim" })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${signature}`, state, expected, { now: 1, key })).toBeNull();
  });

  it("rejects an expired state", () => {
    const { state, cookie } = createOAuthState(input, { now: 0, key });
    expect(verifyOAuthState(cookie, state, expected, { now: OAUTH_STATE_TTL_MS + 1, key })).toBeNull();
  });

  it("rejects a state issued to another user or platform", () => {
    const { state, cookie } = createOAuthState(input, { now: 0, key });
    expect(verifyOAuthState(cookie, state, { ...expected, userId: "user-2" }, { now: 1, key })).toBeNull();
    expect(verifyOAuthState(cookie, state, { ...expected, platform: "facebook" }, { now: 1, key })).toBeNull();
  });

  it("rejects a missing cookie or state", () => {
    const { state, cookie } = createOAuthState(input, { now: 0, key });
    expect(verifyOAuthState(undefined, state, expected, { key })).toBeNull();
    expect(verifyOAuthState(cookie, null, expected, { key })).toBeNull();
  });
});
