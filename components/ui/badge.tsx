import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-slate-300 ring-white/10",
  brand: "bg-brand-500/12 text-brand-300 ring-brand-400/25",
  success: "bg-emerald-500/12 text-emerald-300 ring-emerald-400/25",
  warning: "bg-amber-500/12 text-amber-300 ring-amber-400/25",
  danger: "bg-rose-500/12 text-rose-300 ring-rose-400/25",
  accent: "bg-accent-500/12 text-accent-300 ring-accent-400/25",
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-slate-400",
    brand: "bg-brand-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
    accent: "bg-accent-400",
  };
  return (
    <span className={cn("inline-block size-2 rounded-full", colors[tone], pulse && "animate-pulse-ring")} />
  );
}
