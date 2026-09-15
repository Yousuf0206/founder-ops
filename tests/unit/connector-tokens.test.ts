import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptToken,
  encryptToken,
  loadTokenKey,
  TokenDecryptError,
  tokenContext,
  TokenKeyError,
} from "@/lib/connectors/tokens";

/** 002 T2.2 — OAuth tokens are sealed at rest (NFR-005, plan D7). */

const key = randomBytes(32);
const context = tokenContext("ws-1", "linkedin", "abc123");

describe("token sealing", () => {
  it("round-trips a token", () => {
    const sealed = encryptToken("secret-access-token", context, key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("secret-access-token");
    expect(decryptToken(sealed, context, key)).toBe("secret-access-token");
  });

  it("never produces the same ciphertext twice", () => {
    expect(encryptToken("same", context, key)).not.toBe(encryptToken("same", context, key));
  });

  it("refuses a tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptToken("secret", context, key).split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), context, key)).toThrow(
      TokenDecryptError,
    );
  });

  it("refuses the wrong key", () => {
    const sealed = encryptToken("secret", context, key);
    expect(() => decryptToken(sealed, context, randomBytes(32))).toThrow(TokenDecryptError);
  });

  it("refuses a ciphertext moved onto another account", () => {
    const sealed = encryptToken("secret", context, key);
    expect(() => decryptToken(sealed, tokenContext("ws-2", "linkedin", "abc123"), key)).toThrow(
      TokenDecryptError,
    );
  });

  it("refuses a truncated authentication tag", () => {
    const [v, iv, tag, ct] = encryptToken("secret", context, key).split(".");
    const short = Buffer.from(tag!, "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptToken([v, iv, short, ct].join("."), context, key)).toThrow(TokenDecryptError);
  });

  it("refuses malformed input", () => {
    expect(() => decryptToken("plaintext-token", context, key)).toThrow(TokenDecryptError);
  });
});

describe("loadTokenKey", () => {
  it("requires a 32-byte base64 key", () => {
    expect(() => loadTokenKey({})).toThrow(TokenKeyError);
    expect(() => loadTokenKey({ CONNECTOR_TOKEN_KEY: randomBytes(16).toString("base64") })).toThrow(
      TokenKeyError,
    );
    expect(loadTokenKey({ CONNECTOR_TOKEN_KEY: key.toString("base64") }).equals(key)).toBe(true);
  });
});
