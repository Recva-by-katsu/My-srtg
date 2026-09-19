import { cn } from "@/lib/utils/cn";

export function Progress({
  value,
  className,
  barClassName,
  size = "md",
  indeterminate = false,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  size?: "xs" | "sm" | "md" | "lg";
  indeterminate?: boolean;
}) {
  const heights = { xs: "h-1", sm: "h-1.5", md: "h-2.5", lg: "h-4" } as const;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-white/[0.07]", heights[size], className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-brand-400 via-brand-500 to-accent-500 transition-[width] duration-300 ease-out",
          indeterminate && "w-1/3 animate-[katsu-shimmer_1.4s_linear_infinite]",
          barClassName,
        )}
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}
