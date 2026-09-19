import { getConfig } from "@/lib/config/env";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("state-store");

/**
 * Tiny key/value abstraction used for rate limiting and short lived server state.
 *
 * A memory store always exists (per isolate). When a database is configured the
 * same interface is backed by D1/KV so counters are shared between instances,
 * which is what makes rate limiting meaningful on a multi-isolate platform.
 */
export interface StateStore {
  readonly kind: "memory" | "database";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class MemoryStateStore implements StateStore {
  readonly kind = "memory" as const;
  private readonly entries = new Map<string, MemoryEntry>();
  private lastSweep = Date.now();

  async get(key: string): Promise<string | null> {
    this.sweep();
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.sweep();
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Keeps the map from growing forever on long lived isolates. */
  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > 0 && entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

let sharedStore: StateStore | undefined;

/**
 * Returns the shared state store, preferring the configured database.
 * Falls back to memory when the database is unreachable or not configured yet.
 */
export async function getStateStore(): Promise<StateStore> {
  if (sharedStore) return sharedStore;
  const memory = new MemoryStateStore();
  const config = getConfig();

  if (config.app.demoMode || config.database.driver === "memory") {
    sharedStore = memory;
    return sharedStore;
  }

  try {
    const { getDatabase } = await import("@/lib/db");
    const db = await getDatabase();
    sharedStore = {
      kind: "database",
      get: (key) => db.getState(key),
      set: (key, value, ttlSeconds) => db.setState(key, value, ttlSeconds),
      delete: (key) => db.deleteState(key),
    };
  } catch (error) {
    logger.warn("Database state store unavailable, falling back to memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    sharedStore = memory;
  }

  return sharedStore;
}

export function resetStateStore(): void {
  sharedStore = undefined;
}
