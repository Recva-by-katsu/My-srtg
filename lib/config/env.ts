import { parseSizeToBytes } from "@/lib/utils/format";

/**
 * Single source of truth for environment configuration.
 *
 * Every value is read from `process.env`, which is populated by:
 *  - Vercel            -> Project Settings -> Environment Variables
 *  - Cloudflare        -> Workers & Pages -> Settings -> Variables and Secrets
 *  - local development -> .env.local (copy of .env.example)
 */

export type DatabaseDriver = "d1" | "kv" | "memory";
export type DownloadMode = "stream" | "redirect" | "worker";

function str(key: string, fallback = ""): string {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : value.trim();
}

function num(key: string, fallback: number): number {
  const raw = str(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = str(key).toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function enumValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = str(key).toLowerCase() as T;
  return allowed.includes(raw) ? raw : fallback;
}

export interface AppConfig {
  app: {
    name: string;
    url: string;
    demoMode: boolean;
    logLevel: string;
  };
  admin: {
    username: string;
    passwordHash: string;
    passwordIterations: number;
    sessionSecret: string;
    sessionTtlSeconds: number;
    sessionCookieName: string;
    csrfCookieName: string;
    credentialEncryptionKey: string;
  };
  cloudflare: {
    accountId: string;
    apiToken: string;
    apiBaseUrl: string;
  };
  database: {
    driver: DatabaseDriver;
    d1DatabaseId: string;
    kvNamespaceId: string;
  };
  storage: {
    objectKeyPrefix: string;
    defaultPartSizeBytes: number;
    maxUploadSizeBytes: number;
    maxConcurrentParts: number;
    probeKey: string;
  };
  download: {
    mode: DownloadMode;
    workerUrl: string;
    signingSecret: string;
    linkTtlSeconds: number;
    publicListing: boolean;
    inlineContentTypes: boolean;
  };
  rateLimit: {
    loginAttempts: number;
    loginWindowSeconds: number;
    apiRequests: number;
    apiWindowSeconds: number;
    downloads: number;
    downloadWindowSeconds: number;
  };
}

const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_PART_SIZE_MB = 8;
const DEFAULT_MAX_UPLOAD_GB = 20;

function buildConfig(): AppConfig {
  const sessionSecret = str("SESSION_SECRET");
  const downloadSigningSecret = str("DOWNLOAD_SIGNING_SECRET") || sessionSecret;

  return {
    app: {
      name: str("APP_NAME", "Katsu R2 Manager"),
      url: str("APP_URL", ""),
      demoMode: bool("DEMO_MODE", false),
      logLevel: str("LOG_LEVEL", "info"),
    },
    admin: {
      username: str("ADMIN_USERNAME", "katsu"),
      passwordHash: str("ADMIN_PASSWORD_HASH"),
      passwordIterations: Math.max(
        10_000,
        Math.min(600_000, num("PASSWORD_PBKDF2_ITERATIONS", 100_000)),
      ),
      sessionSecret,
      sessionTtlSeconds: Math.max(
        300,
        num("SESSION_TTL_HOURS", DEFAULT_SESSION_TTL_HOURS) * 60 * 60,
      ),
      sessionCookieName: str("SESSION_COOKIE_NAME", "katsu_session"),
      csrfCookieName: str("CSRF_COOKIE_NAME", "katsu_csrf"),
      credentialEncryptionKey: str("CREDENTIAL_ENCRYPTION_KEY"),
    },
    cloudflare: {
      accountId: str("CLOUDFLARE_ACCOUNT_ID"),
      apiToken: str("CLOUDFLARE_API_TOKEN"),
      apiBaseUrl: str("CLOUDFLARE_API_BASE_URL", "https://api.cloudflare.com/client/v4"),
    },
    database: {
      driver: enumValue<DatabaseDriver>("DATABASE_DRIVER", ["d1", "kv", "memory"], "d1"),
      d1DatabaseId: str("DATABASE_ID"),
      kvNamespaceId: str("KV_NAMESPACE_ID"),
    },
    storage: {
      objectKeyPrefix: str("STORAGE_OBJECT_PREFIX", "files").replace(/^\/+|\/+$/g, ""),
      defaultPartSizeBytes: Math.max(
        5,
        num("DEFAULT_PART_SIZE_MB", DEFAULT_PART_SIZE_MB),
      ) * 1024 * 1024,
      maxUploadSizeBytes: parseSizeToBytes(
        Math.max(0.001, num("MAX_UPLOAD_SIZE_GB", DEFAULT_MAX_UPLOAD_GB)),
        "GB",
      ),
      maxConcurrentParts: Math.max(1, Math.min(8, num("MAX_CONCURRENT_PARTS", 3))),
      probeKey: str("STORAGE_PROBE_KEY", ".katsu/connection-probe.txt"),
    },
    download: {
      mode: enumValue<DownloadMode>("DOWNLOAD_MODE", ["stream", "redirect", "worker"], "stream"),
      workerUrl: str("DOWNLOAD_WORKER_URL"),
      signingSecret: downloadSigningSecret,
      linkTtlSeconds: Math.max(60, num("DOWNLOAD_LINK_TTL_SECONDS", 6 * 60 * 60)),
      publicListing: bool("PUBLIC_LISTING", true),
      inlineContentTypes: bool("DOWNLOAD_INLINE_CONTENT_TYPES", false),
    },
    rateLimit: {
      loginAttempts: Math.max(1, num("RATE_LIMIT_LOGIN_ATTEMPTS", 6)),
      loginWindowSeconds: Math.max(30, num("RATE_LIMIT_LOGIN_WINDOW_SECONDS", 15 * 60)),
      apiRequests: Math.max(10, num("RATE_LIMIT_API_REQUESTS", 240)),
      apiWindowSeconds: Math.max(10, num("RATE_LIMIT_API_WINDOW_SECONDS", 60)),
      downloads: Math.max(5, num("RATE_LIMIT_DOWNLOAD_REQUESTS", 120)),
      downloadWindowSeconds: Math.max(10, num("RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS", 60)),
    },
  };
}

let cached: AppConfig | undefined;

/** Returns the resolved configuration. Values are read once per isolate. */
export function getConfig(): AppConfig {
  if (!cached) cached = buildConfig();
  return cached;
}

/** Test hook: drops the cached configuration so new env values are picked up. */
export function resetConfigCache(): void {
  cached = undefined;
}

export interface ConfigIssue {
  level: "error" | "warn" | "info";
  key: string;
  message: string;
}

export interface ConfigReport {
  ready: boolean;
  issues: ConfigIssue[];
  driver: DatabaseDriver;
  downloadMode: DownloadMode;
  demoMode: boolean;
  credentialsEncrypted: boolean;
  adminConfigured: boolean;
}

/**
 * Human readable health report used by `/admin/settings` (diagnostics) and by
 * the installer banner on the public site.
 */
export function getConfigReport(): ConfigReport {
  const config = getConfig();
  const issues: ConfigIssue[] = [];

  if (!config.admin.passwordHash) {
    issues.push({
      level: "error",
      key: "ADMIN_PASSWORD_HASH",
      message:
        "Admin password hash belum di-set. Login admin tidak akan berfungsi sampai variabel ini diisi (buat hash-nya lewat Setup Assistant di /setup).",
    });
  }

  if (!config.admin.sessionSecret) {
    issues.push({
      level: "error",
      key: "SESSION_SECRET",
      message:
        "SESSION_SECRET kosong. Session cookie tidak bisa ditandatangani sehingga login akan selalu gagal.",
    });
  } else if (config.admin.sessionSecret.length < 32) {
    issues.push({
      level: "warn",
      key: "SESSION_SECRET",
      message: "SESSION_SECRET sebaiknya minimal 32 karakter acak.",
    });
  }

  if (!config.admin.credentialEncryptionKey) {
    issues.push({
      level: "error",
      key: "CREDENTIAL_ENCRYPTION_KEY",
      message:
        "CREDENTIAL_ENCRYPTION_KEY kosong. Kredensial R2 tidak dapat dienkripsi saat disimpan, sehingga menambahkan storage akan ditolak.",
    });
  }

  const hasCloudflareApi =
    Boolean(config.cloudflare.accountId) && Boolean(config.cloudflare.apiToken);

  if (config.database.driver === "d1" && (!hasCloudflareApi || !config.database.d1DatabaseId)) {
    issues.push({
      level: "error",
      key: "DATABASE_ID",
      message:
        "Driver database D1 membutuhkan CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, dan DATABASE_ID.",
    });
  }

  if (config.database.driver === "kv" && (!hasCloudflareApi || !config.database.kvNamespaceId)) {
    issues.push({
      level: "error",
      key: "KV_NAMESPACE_ID",
      message:
        "Driver database KV membutuhkan CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, dan KV_NAMESPACE_ID.",
    });
  }

  if (config.download.mode === "worker" && !config.download.workerUrl) {
    issues.push({
      level: "error",
      key: "DOWNLOAD_WORKER_URL",
      message: "DOWNLOAD_MODE=worker membutuhkan DOWNLOAD_WORKER_URL.",
    });
  }

  if (config.download.mode === "redirect") {
    issues.push({
      level: "warn",
      key: "DOWNLOAD_MODE",
      message:
        "DOWNLOAD_MODE=redirect mengirim user langsung ke endpoint R2 (pre-signed URL). Mode ini lebih ringan, tetapi URL sementara mengekspos nama bucket & account id. Gunakan 'stream' bila ingin semuanya tersembunyi.",
    });
  }

  if (!config.app.url) {
    issues.push({
      level: "warn",
      key: "APP_URL",
      message:
        "APP_URL belum di-set. Link download yang dibagikan akan memakai origin dari request (tetap aman, namun sebaiknya diisi agar konsisten).",
    });
  }

  if (config.app.demoMode) {
    issues.push({
      level: "warn",
      key: "DEMO_MODE",
      message:
        "DEMO_MODE aktif: database memakai data contoh in-memory dan upload/download ke R2 dinonaktifkan. Matikan untuk produksi.",
    });
  }

  const errors = issues.filter((issue) => issue.level === "error");

  return {
    ready: errors.length === 0,
    issues,
    driver: config.database.driver,
    downloadMode: config.download.mode,
    demoMode: config.app.demoMode,
    credentialsEncrypted: Boolean(config.admin.credentialEncryptionKey),
    adminConfigured: Boolean(config.admin.passwordHash && config.admin.sessionSecret),
  };
}

/** Base URL of the application, derived from config (used for shareable links). */
export function resolveBaseUrl(requestUrl?: string | URL): string {
  const configured = getConfig().app.url;
  if (configured) return configured.replace(/\/+$/, "");
  if (requestUrl) {
    const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
    return url.origin;
  }
  return "";
}
