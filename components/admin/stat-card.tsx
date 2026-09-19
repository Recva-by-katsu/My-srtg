import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "accent" | "success" | "warning";
  className?: string;
}) {
  const tones: Record<string, string> = {
    brand: "from-brand-500/20 to-brand-400/5 text-brand-300 ring-brand-400/20",
    accent: "from-accent-500/20 to-accent-400/5 text-accent-300 ring-accent-400/20",
    success: "from-emerald-500/20 to-emerald-400/5 text-emerald-300 ring-emerald-400/20",
    warning: "from-amber-500/20 to-amber-400/5 text-amber-300 ring-amber-400/20",
  };

  return (
    <div className={cn("glass glass-hover flex items-start gap-4 rounded-2xl p-4 sm:p-5", className)}>
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1", tones[tone] ?? tones.brand)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-white tabular-nums sm:text-2xl">{value}</p>
        {hint ? <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
