export const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

export function formatBytesPerSecond(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function parseSizeToBytes(input: string | number, unit: "MB" | "GB" | "TB" = "GB"): number {
  const value = typeof input === "number" ? input : Number.parseFloat(input);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const multiplier = unit === "MB" ? 1024 ** 2 : unit === "GB" ? 1024 ** 3 : 1024 ** 4;
  return Math.round(value * multiplier);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

export function formatDate(iso: string | number | Date, locale = "id-ID"): string {
  const date = typeof iso === "string" || typeof iso === "number" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeTime(iso: string | number | Date, locale = "id-ID"): string {
  const date = typeof iso === "string" || typeof iso === "number" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "-";
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, secondsPerUnit] of thresholds) {
    if (Math.abs(diffSeconds) >= secondsPerUnit) {
      return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }
  return formatter.format(diffSeconds, "second");
}

export function formatNumber(value: number, locale = "id-ID"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

const FILE_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  image: "Gambar",
  archive: "Arsip",
  document: "Dokumen",
  text: "Teks",
  application: "Aplikasi",
  other: "Berkas",
};

export type FileCategory = keyof typeof FILE_TYPE_LABELS;

export function categorizeFile(filename: string, contentType?: string | null): FileCategory {
  const extension = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  const type = (contentType ?? "").toLowerCase();

  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/")) return "text";

  if (["mp4", "mkv", "mov", "avi", "webm", "m4v", "flv", "ts"].includes(extension)) return "video";
  if (["mp3", "flac", "wav", "aac", "ogg", "m4a", "opus"].includes(extension)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic"].includes(extension)) return "image";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "img"].includes(extension)) return "archive";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "epub"].includes(extension)) return "document";
  if (["apk", "exe", "msi", "dmg", "deb", "rpm", "appimage"].includes(extension)) return "application";
  if (["txt", "md", "json", "csv", "log", "srt", "ass", "vtt"].includes(extension)) return "text";

  return "other";
}

export function fileCategoryLabel(category: FileCategory): string {
  return FILE_TYPE_LABELS[category] ?? "Berkas";
}
