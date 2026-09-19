import { cn } from "@/lib/utils/cn";
import { formatBytes, percentage } from "@/lib/utils/format";

export function UsageBar({
  used,
  limit,
  className,
  showLabels = true,
  compact = false,
}: {
  used: number;
  limit: number;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}) {
  const percent = Math.round(percentage(used, limit) * 10) / 10;
  const tone =
    percent >= 95
      ? "from-rose-500 to-rose-400"
      : percent >= 80
        ? "from-amber-500 to-amber-400"
        : "from-brand-400 to-accent-500";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("w-full overflow-hidden rounded-full bg-white/[0.07]", compact ? "h-1.5" : "h-2.5")}>
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out", tone)}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {showLabels ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="font-medium text-slate-300">
            {formatBytes(used)} <span className="text-slate-500">/</span> {limit > 0 ? formatBytes(limit) : "tanpa batas"}
          </span>
          <span className={cn("tabular-nums", percent >= 95 ? "text-rose-300" : percent >= 80 ? "text-amber-300" : "text-brand-300")}>
            {limit > 0 ? `${percent}%` : "∞"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
