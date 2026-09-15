import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * OAuth token sealing (002 T2.2, plan D7, NFR-005).
 *
 * AES-256-GCM with a 32-byte key from CONNECTOR_TOKEN_KEY. The account's
 * identity (workspace, platform, external id) is bound in as associated data,
 * so a ciphertext copied onto another account's row fails to open.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, each base64url. The version prefix is the
 * hook for key rotation: a v2 would name its key.
 */

export class TokenKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenKeyError";
  }
}

export class TokenDecryptError extends Error {
  constructor() {
    super("A stored connector token could not be decrypted. Reconnect the account.");
    this.name = "TokenDecryptError";
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function loadTokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.CONNECTOR_TOKEN_KEY;
  if (!raw) {
    throw new TokenKeyError(
      "CONNECTOR_TOKEN_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new TokenKeyError("CONNECTOR_TOKEN_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function tokenContext(workspaceId: string, platform: string, externalAccountId: string): string {
  return `${workspaceId}:${platform}:${externalAccountId}`;
}

export function encryptToken(plaintext: string, context: string, key: Buffer = loadTokenKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(sealed: string, context: string, key: Buffer = loadTokenKey()): string {
  const [version, ivText, tagText, ciphertextText, ...rest] = sealed.split(".");
  if (version !== "v1" || !ivText || !tagText || ciphertextText === undefined || rest.length > 0) {
    throw new TokenDecryptError();
  }

  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  // A truncated tag weakens GCM's integrity guarantee, so refuse it outright.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new TokenDecryptError();

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new TokenDecryptError();
  }
}
