/**
 * Optional at-rest encryption for the stored LeetCode session cookies.
 *
 * A hosted deployment keeps `settings.leetcodeSession` / `leetcodeCsrf` on a
 * cloud database. When `APP_SECRET_KEY` is set (32 bytes, base64), those values
 * are AES-256-GCM encrypted before they're written and decrypted on read.
 *
 * When the key is NOT set, `encrypt` / `decrypt` are pass-throughs — so local
 * development and any existing plaintext rows keep working unchanged.
 *
 * Encrypted form:  enc:v1:<iv b64>:<authTag b64>:<ciphertext b64>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

/** The key, or null when encryption is disabled. Throws if set but malformed. */
function loadKey(): Buffer | null {
  const raw = process.env.APP_SECRET_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_SECRET_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  }
  return key;
}

export function encrypt(plain: string): string {
  const key = loadKey();
  if (!key) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // plaintext row, or key disabled

  const key = loadKey();
  if (!key) {
    throw new Error("APP_SECRET_KEY is required to read encrypted settings");
  }

  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
