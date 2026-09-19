const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_FILENAME_LENGTH = 180;

export interface SanitizeOptions {
  maxLength?: number;
  fallback?: string;
  allowDots?: boolean;
}

/**
 * Turns untrusted user input into a safe file name.
 *
 * Protects against path traversal (`../../etc/passwd`), null byte injection,
 * control characters, Windows reserved device names and absurdly long names.
 */
export function sanitizeFilename(input: string, options: SanitizeOptions = {}): string {
  const maxLength = options.maxLength ?? MAX_FILENAME_LENGTH;
  const fallback = options.fallback ?? "file";

  if (typeof input !== "string") return fallback;

  let name = input
    .normalize("NFKC")
    .replace(CONTROL_CHARS, "")
    .replace(/[\/\\]/g, "-")
    .replace(/[:*?"<>|]/g, "-")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();

  name = name.replace(/^\.+/, options.allowDots ? "." : "_");
  name = name.replace(/\.+$/, "");

  if (!name || name === "." || name === "..") return fallback;

  const baseName = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  if (WINDOWS_RESERVED.test(baseName)) name = `_${name}`;

  if (name.length > maxLength) {
    const dotIndex = name.lastIndexOf(".");
    const extension = dotIndex > name.length - 12 && dotIndex > 0 ? name.slice(dotIndex) : "";
    const stem = extension ? name.slice(0, name.length - extension.length) : name;
    name = `${stem.slice(0, Math.max(1, maxLength - extension.length))}${extension}`;
  }

  return name;
}

/** Sanitizes a single path segment used inside an R2 object key. */
export function sanitizeObjectKeySegment(input: string): string {
  const cleaned = sanitizeFilename(input, { maxLength: 120 })
    .replace(/[^A-Za-z0-9._\- ]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

export interface ObjectKeyOptions {
  prefix?: string;
  filename: string;
  identifier: string;
  now?: Date;
}

/**
 * Builds the R2 object key: `<prefix>/2026/09/<identifier>-<safe-file-name>`.
 *
 * The identifier prefix guarantees uniqueness without exposing sequential numbers,
 * while the readable suffix keeps bucket browsing (in the Cloudflare dashboard) sane.
 */
export function buildObjectKey({ prefix, filename, identifier, now = new Date() }: ObjectKeyOptions): string {
  const segments = [prefix ?? "files", String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0")]
    .map((segment) => sanitizeObjectKeySegment(segment))
    .filter(Boolean);
  const safeName = sanitizeObjectKeySegment(filename);
  segments.push(`${identifier}-${safeName}`);
  return segments.join("/");
}

/** Limits a free-text search term and escapes SQL LIKE wildcards. */
export function sanitizeSearchTerm(input: string | null | undefined, maxLength = 80): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, maxLength);
}

export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Renders a secret for display: `AKIA...4F2B`. Never returns the full value. */
export function maskSecret(value: string | null | undefined, leading = 4, trailing = 4): string {
  if (!value) return "";
  if (value.length <= leading + trailing) return "*".repeat(value.length);
  return `${value.slice(0, leading)}${"*".repeat(Math.min(8, value.length - leading - trailing))}${value.slice(-trailing)}`;
}

/** Validates that a Cloudflare account id looks like a 32 char hex string. */
export function isCloudflareAccountId(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value);
}

export function isR2BucketName(value: string): boolean {
  return /^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/.test(value);
}
