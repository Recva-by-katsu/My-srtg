/**
 * Base64 / Base64URL helpers built on top of Uint8Array + Web APIs only.
 *
 * The application runs on three different runtimes (Node.js on Vercel, workerd on
 * Cloudflare, and the browser for the upload manager), therefore we deliberately
 * avoid `Buffer` and `btoa(String.fromCharCode(...))` tricks that break on large
 * payloads or are unavailable in workerd.
 */

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // `btoa` exists in Node 16+, workerd and every browser we support.
  const b64 = btoa(out);
  if (!urlSafe) return b64;
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(input: string, urlSafe: boolean): Uint8Array {
  let normalized = input.trim();
  if (urlSafe) {
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
  }
  while (normalized.length % 4 !== 0) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64Encode(bytes: Uint8Array): string {
  return bytesToBase64(bytes, false);
}

export function base64Decode(value: string): Uint8Array {
  return base64ToBytes(value, false);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes, true);
}

export function base64UrlDecode(value: string): Uint8Array {
  return base64ToBytes(value, true);
}

export function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

export function base64UrlToText(value: string): string {
  return new TextDecoder().decode(base64UrlDecode(value));
}

/** Converts a hex string ("a3f0...") into bytes. Used for encryption keys. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/[^0-9a-fA-F]/g, "");
  const padded = clean.length % 2 === 0 ? clean : `0${clean}`;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Accepts base64, base64url, hex or a raw passphrase and returns 32 usable bytes.
 * Passphrases are stretched with SHA-256 so that any input yields a valid AES-256 key.
 */
export async function normalizeKeyMaterial(secret: string): Promise<Uint8Array> {
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return hexToBytes(trimmed);

  try {
    const decoded = base64Decode(trimmed);
    if ((decoded.length === 16 || decoded.length === 32) && base64Encode(decoded) === trimmed) {
      return decoded.length === 32 ? decoded : await sha256Bytes(decoded);
    }
  } catch {
    /* not base64 - fall through to passphrase stretching */
  }

  return sha256Bytes(new TextEncoder().encode(trimmed));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}
