import { sha256 } from "@/lib/utils/crypto";

/**
 * AWS Signature Version 4 implementation for the S3 compatible R2 API.
 *
 * Written directly on top of `fetch` + Web Crypto (no AWS SDK) so the very same
 * code runs on Vercel's Node runtime, Cloudflare workerd and in local dev.
 */

export interface SignatureCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

const ALGORITHM = "AWS4-HMAC-SHA256";
const EMPTY_PAYLOAD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/** RFC3986 percent encoding (encodeURIComponent leaves `!'()*` alone). */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function encodePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized
    .split("/")
    .map((segment) => rfc3986(decodeURIComponent(segment)))
    .join("/");
}

export function canonicalQueryString(searchParams: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  searchParams.forEach((value, key) => entries.push([key, value]));
  entries.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return entries.map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    (typeof key === "string" ? new TextEncoder().encode(key) : key) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data) as unknown as ArrayBuffer,
  );
  return new Uint8Array(signature);
}

export function amzDateStamp(date: Date): { amzDate: string; dateStamp: string } {
  return {
    amzDate: date.toISOString().replace(/[:-]|\.\d{3}/g, ""),
    dateStamp: date.toISOString().slice(0, 10).replace(/-/g, ""),
  };
}

async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface CanonicalRequestInput {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
}

export function buildCanonicalRequest(input: CanonicalRequestInput): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    lowered[key.toLowerCase()] = String(value).replace(/\s+/g, " ").trim();
  }
  const headerNames = Object.keys(lowered).sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${lowered[name]}\n`).join("");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    input.method.toUpperCase(),
    encodePath(input.url.pathname),
    canonicalQueryString(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  return { canonicalRequest, signedHeaders };
}

export interface SignOptions {
  method: string;
  url: URL;
  credentials: SignatureCredentials;
  region?: string;
  service?: string;
  headers?: Record<string, string>;
  /** Hex encoded SHA-256 of the body, or `UNSIGNED-PAYLOAD`. */
  payloadHash?: string;
  now?: Date;
}

/** Signs a request and returns the headers that must be sent (including Authorization). */
export async function signRequest(options: SignOptions): Promise<SignedRequest> {
  const region = options.region ?? "auto";
  const service = options.service ?? "s3";
  const now = options.now ?? new Date();
  const { amzDate, dateStamp } = amzDateStamp(now);

  const headers: Record<string, string> = {
    host: options.url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": options.payloadHash ?? UNSIGNED_PAYLOAD,
    ...normalizeHeaderKeys(options.headers ?? {}),
  };

  if (options.credentials.sessionToken) {
    headers["x-amz-security-token"] = options.credentials.sessionToken;
  }

  const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
    method: options.method,
    url: options.url,
    headers,
    payloadHash: headers["x-amz-content-sha256"]!,
  });

  const credentialScope = [dateStamp, region, service, "aws4_request"].join("/");
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest)),
  ].join("\n");

  const signingKey = await deriveSigningKey(options.credentials.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  headers.Authorization =
    `${ALGORITHM} Credential=${options.credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // `host` is provided by fetch itself; sending it twice is harmless but noisy.
  const { host: _host, ...rest } = headers;
  void _host;

  return { url: options.url.toString(), headers: rest };
}

export interface PresignOptions {
  method: string;
  url: URL;
  credentials: SignatureCredentials;
  expiresIn?: number;
  region?: string;
  service?: string;
  /** Extra headers the client MUST send for the signature to validate. */
  headers?: Record<string, string>;
  now?: Date;
}

/** Produces a pre-signed URL (query string authentication) for browser side transfers. */
export async function presignUrl(options: PresignOptions): Promise<string> {
  const region = options.region ?? "auto";
  const service = options.service ?? "s3";
  const now = options.now ?? new Date();
  const { amzDate, dateStamp } = amzDateStamp(now);
  const expiresIn = Math.max(1, Math.min(604_800, Math.round(options.expiresIn ?? 3600)));

  const signedHeaderNames = Object.keys(normalizeHeaderKeys(options.headers ?? {}))
    .map((name) => name.toLowerCase())
    .sort();
  const signedHeaders = ["host", ...signedHeaderNames.filter((name) => name !== "host")].join(";");

  const url = new URL(options.url.toString());
  url.searchParams.set("X-Amz-Algorithm", ALGORITHM);
  url.searchParams.set(
    "X-Amz-Credential",
    `${options.credentials.accessKeyId}/${[dateStamp, region, service, "aws4_request"].join("/")}`,
  );
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders);
  if (options.credentials.sessionToken) {
    url.searchParams.set("X-Amz-Security-Token", options.credentials.sessionToken);
  }

  const headers: Record<string, string> = {
    host: url.host,
    ...normalizeHeaderKeys(options.headers ?? {}),
  };

  const { canonicalRequest } = buildCanonicalRequest({
    method: options.method,
    url,
    headers,
    payloadHash: UNSIGNED_PAYLOAD,
  });

  const credentialScope = [dateStamp, region, service, "aws4_request"].join("/");
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest)),
  ].join("\n");

  const signingKey = await deriveSigningKey(options.credentials.secretAccessKey, dateStamp, region, service);
  url.searchParams.set("X-Amz-Signature", toHex(await hmac(signingKey, stringToSign)));

  return url.toString();
}

export async function sha256HexPayload(body: BodyInit | null | undefined): Promise<string> {
  if (body === null || body === undefined) return EMPTY_PAYLOAD_HASH;
  if (typeof body === "string") return toHex(await sha256(body));
  if (body instanceof Uint8Array) return toHex(await sha256(body));
  if (body instanceof ArrayBuffer) return toHex(await sha256(new Uint8Array(body)));
  return UNSIGNED_PAYLOAD;
}

function normalizeHeaderKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  return out;
}
