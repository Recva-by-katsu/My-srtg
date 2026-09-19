import { base64UrlDecode, base64UrlEncode, normalizeKeyMaterial } from "@/lib/utils/encoding";

/**
 * Runtime agnostic cryptography (Web Crypto only).
 *
 * Everything in this file works identically in Node.js (Vercel), workerd
 * (Cloudflare Workers / Pages) and modern browsers.
 */

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomToken(byteLength = 32): string {
  return base64UrlEncode(randomBytes(byteLength));
}

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = await sha256(data);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function importHmacKey(secret: string) {
  const keyMaterial = await normalizeKeyMaterial(secret);
  return crypto.subtle.importKey(
    "raw",
    keyMaterial as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSha256(secret: string, data: string | Uint8Array): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const signature = await crypto.subtle.sign("HMAC", key, bytes as unknown as ArrayBuffer);
  return new Uint8Array(signature);
}

export async function hmacSha256Base64Url(secret: string, data: string): Promise<string> {
  return base64UrlEncode(await hmacSha256(secret, data));
}

/**
 * Constant time comparison. Lengths are compared first, which is the standard
 * trade-off used by Node's `crypto.timingSafeEqual` consumers.
 */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const left = typeof a === "string" ? new TextEncoder().encode(a) : a;
  const right = typeof b === "string" ? new TextEncoder().encode(b) : b;
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

async function importAesKey(secret: string) {
  const keyMaterial = await normalizeKeyMaterial(secret);
  return crypto.subtle.importKey(
    "raw",
    keyMaterial as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts a secret (R2 credentials) for storage at rest: `base64url(iv).base64url(ciphertext)`. */
export async function aesGcmEncrypt(secret: string, plaintext: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext) as unknown as ArrayBuffer,
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(cipher))}`;
}

export async function aesGcmDecrypt(secret: string, payload: string): Promise<string> {
  const [ivPart, dataPart] = payload.split(".");
  if (!ivPart || !dataPart) throw new Error("Malformed encrypted payload");
  const key = await importAesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(ivPart) as unknown as ArrayBuffer },
    key,
    base64UrlDecode(dataPart) as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}
