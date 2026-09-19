import { getStateStore, type StateStore } from "@/lib/security/state-store";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("rate-limit");

export interface RateLimitOptions {
  /** Maximum number of hits allowed inside the window. */
  limit: number;
  /** Window length in seconds (fixed window). */
  windowSeconds: number;
  /** Optional explicit store, mainly for tests. */
  store?: StateStore;
  /** Namespace prefix, defaults to "rl". */
  prefix?: string;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface WindowRecord {
  count: number;
  resetAt: number;
}

function storageKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

/**
 * Fixed window rate limiter with a shared (database backed) counter store and a
 * graceful in-memory fallback.
 */
export async function rateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const store = options.store ?? (await getStateStore());
  const prefix = options.prefix ?? "rl";
  const now = Date.now();
  const storageKeyFor = storageKey(prefix, key);

  const empty = (): RateLimitResult => ({
    ok: true,
    limit: options.limit,
    remaining: options.limit,
    resetAt: now + options.windowSeconds * 1000,
    retryAfterSeconds: 0,
  });

  try {
    const raw = await store.get(storageKeyFor);
    let record: WindowRecord | null = null;
    if (raw) {
      const parsed = JSON.parse(raw) as WindowRecord;
      if (typeof parsed.count === "number" && typeof parsed.resetAt === "number") record = parsed;
    }

    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + options.windowSeconds * 1000 };
    }

    record.count += 1;
    const ttlSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000) + 5);
    await store.set(storageKeyFor, JSON.stringify(record), ttlSeconds);

    const ok = record.count <= options.limit;
    return {
      ok,
      limit: options.limit,
      remaining: Math.max(0, options.limit - record.count),
      resetAt: record.resetAt,
      retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  } catch (error) {
    // Failing open keeps the product usable when the database hiccups, while the
    // warning makes the degradation visible in the platform logs.
    logger.warn("Rate limiter failed open", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return empty();
  }
}

/** Clears a counter (used after a successful login). */
export async function resetRateLimit(key: string, prefix = "rl"): Promise<void> {
  const store = await getStateStore();
  await store.delete(storageKey(prefix, key));
}

/** Convenience helper for "N requests per minute per IP" style limits. */
export function rateLimitKey(scope: string, ...parts: Array<string | number | undefined>): string {
  return [scope, ...parts.filter((part) => part !== undefined && part !== "")].join(":");
}
