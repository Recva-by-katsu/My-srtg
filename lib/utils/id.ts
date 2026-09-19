import { randomBytes } from "@/lib/utils/crypto";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const DOWNLOAD_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz"; // no look-alikes (0/o, 1/l/i)

function randomString(length: number, alphabet: string): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** 26 character sortable-ish identifier (timestamp prefix + randomness). */
export function createId(prefix?: string): string {
  const timestamp = Date.now().toString(36).padStart(9, "0");
  const random = randomString(12, ID_ALPHABET);
  const id = `${timestamp}${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

/** Short, human friendly, URL safe identifier used by the public download center. */
export function createDownloadId(length = 10): string {
  return randomString(length, DOWNLOAD_ALPHABET);
}

export function isValidDownloadId(value: string): boolean {
  return /^[2-9a-z]{6,32}$/.test(value);
}

export function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
