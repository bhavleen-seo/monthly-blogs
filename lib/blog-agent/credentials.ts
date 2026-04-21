/**
 * AES-256-GCM encryption for at-rest credential storage in KV.
 *
 * Stores encrypted blobs so that a KV dump doesn't leak plaintext WordPress
 * credentials. The master key lives only in Vercel env (CREDS_MASTER_KEY).
 *
 * Format of a stored blob:
 *   { v: 1, iv, tag, data }   // all base64
 *
 * Key must be 32 bytes (64 hex chars), typically generated with:
 *   openssl rand -hex 32
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard

export interface EncryptedBlob {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function getKey(): Buffer {
  const hex = process.env.CREDS_MASTER_KEY;
  if (!hex) throw new Error("CREDS_MASTER_KEY not set");
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("CREDS_MASTER_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): EncryptedBlob {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

export function decrypt(blob: EncryptedBlob): string {
  if (blob.v !== 1) throw new Error(`Unsupported blob version: ${blob.v}`);
  const key = getKey();
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
