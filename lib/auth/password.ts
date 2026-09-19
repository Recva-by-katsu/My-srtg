import { base64UrlDecode, base64UrlEncode } from "@/lib/utils/encoding";
import { randomBytes, timingSafeEqual } from "@/lib/utils/crypto";

/**
 * Password hashing with PBKDF2-SHA256 (Web Crypto).
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<salt-b64url>$<hash-b64url>`
 *
 * PBKDF2 is used instead of bcrypt/argon2 because it is available natively in
 * every runtime this project targets (Node.js, Cloudflare workerd, browsers),
 * which means the hash generator in the admin dashboard can produce exactly the
 * same value that the server later verifies - no CLI, no native addon.
 */

const ALGORITHM = "pbkdf2-sha256";
const KEY_LENGTH_BITS = 256;
export const MIN_RECOMMENDED_ITERATIONS = 25_000;
export const DEFAULT_ITERATIONS = 100_000;

/**
 * This module intentionally has no server-only imports: the same PBKDF2 routine
 * powers the browser based setup assistant (`/setup`), so an operator can create
 * `ADMIN_PASSWORD_HASH` without ever sending the password to a server or using a
 * terminal.
 */

export interface PasswordHashParts {
  algorithm: string;
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

export function parsePasswordHash(value: string): PasswordHashParts | null {
  const parts = value.trim().split("$");
  if (parts.length !== 4) return null;
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = parts;
  if (algorithm !== ALGORITHM) return null;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 1) return null;
  try {
    return {
      algorithm,
      iterations,
      salt: base64UrlDecode(saltRaw!),
      hash: base64UrlDecode(hashRaw!),
    };
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, iterations);
  return [ALGORITHM, iterations, base64UrlEncode(salt), base64UrlEncode(hash)].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;
  if (!password) return false;
  const candidate = await derive(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(candidate, parsed.hash);
}

export interface PasswordHashReport {
  configured: boolean;
  valid: boolean;
  iterations: number;
  advice: string[];
}

export function inspectPasswordHash(storedHash: string): PasswordHashReport {
  const advice: string[] = [];
  const parsed = storedHash ? parsePasswordHash(storedHash) : null;

  if (!storedHash) advice.push("ADMIN_PASSWORD_HASH belum diisi.");
  else if (!parsed) advice.push("Format hash tidak dikenali. Gunakan generator di Admin → Settings.");

  if (parsed && parsed.iterations < MIN_RECOMMENDED_ITERATIONS) {
    advice.push(
      `Iterations ${parsed.iterations} di bawah rekomendasi (${MIN_RECOMMENDED_ITERATIONS}).`,
    );
  }

  return {
    configured: Boolean(storedHash),
    valid: Boolean(parsed),
    iterations: parsed?.iterations ?? 0,
    advice,
  };
}
