type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const payload = {
    level,
    scope,
    message,
    at: new Date().toISOString(),
    ...(meta === undefined ? {} : { meta: redact(meta) }),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const SENSITIVE_KEYS = [
  "secretaccesskey",
  "secret",
  "password",
  "authorization",
  "cookie",
  "token",
  "accesskeyid",
  "x-amz-signature",
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
        ? "[redacted]"
        : redact(entry, depth + 1);
    }
    return out;
  }
  return value;
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => emit("debug", scope, message, meta),
    info: (message: string, meta?: unknown) => emit("info", scope, message, meta),
    warn: (message: string, meta?: unknown) => emit("warn", scope, message, meta),
    error: (message: string, meta?: unknown) => emit("error", scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
