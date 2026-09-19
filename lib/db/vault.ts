import { getConfig } from "@/lib/config/env";
import { aesGcmDecrypt, aesGcmEncrypt } from "@/lib/utils/crypto";
import { AppError } from "@/lib/utils/assert";
import { maskSecret } from "@/lib/security/sanitize";

/**
 * Credential vault.
 *
 * R2 access keys are encrypted with AES-256-GCM before they touch the database
 * and are only ever decrypted inside the server runtime, immediately before an
 * S3 request is signed. The API layer returns masked values only.
 */

const VAULT_PREFIX = "enc:v1:";

function encryptionKey(): string {
  const key = getConfig().admin.credentialEncryptionKey;
  if (!key) {
    throw new AppError(
      "encryption_key_missing",
      "CREDENTIAL_ENCRYPTION_KEY belum di-set. Tambahkan variabel ini di dashboard hosting agar kredensial R2 dapat dienkripsi.",
      { status: 503 },
    );
  }
  return key;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(VAULT_PREFIX);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = encryptionKey();
  return `${VAULT_PREFIX}${await aesGcmEncrypt(key, plaintext)}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  if (!isEncryptedValue(stored)) {
    // Values written before the vault existed (or restored from a dump) are
    // returned as-is so an operator can re-save the storage and encrypt them.
    return stored;
  }
  const key = encryptionKey();
  return aesGcmDecrypt(key, stored.slice(VAULT_PREFIX.length));
}

export function maskStoredSecret(stored: string): string {
  if (!stored) return "";
  if (isEncryptedValue(stored)) return "encrypted";
  return maskSecret(stored);
}
