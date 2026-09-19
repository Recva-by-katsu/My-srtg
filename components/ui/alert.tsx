import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "success" | "warning" | "danger";

const CONFIG: Record<Tone, { className: string; icon: ReactNode }> = {
  info: {
    className: "border-brand-400/25 bg-brand-500/8 text-brand-100",
    icon: <Info className="size-4 text-brand-300" />,
  },
  success: {
    className: "border-emerald-400/25 bg-emerald-500/8 text-emerald-100",
    icon: <CheckCircle2 className="size-4 text-emerald-300" />,
  },
  warning: {
    className: "border-amber-400/25 bg-amber-500/8 text-amber-100",
    icon: <AlertTriangle className="size-4 text-amber-300" />,
  },
  danger: {
    className: "border-rose-400/25 bg-rose-500/8 text-rose-100",
    icon: <XCircle className="size-4 text-rose-300" />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const config = CONFIG[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed", config.className, className)}>
      <span className="mt-0.5 shrink-0">{config.icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-white">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-1" : undefined, "text-slate-300/90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ShieldNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent-400/20 bg-accent-500/8 p-3.5 text-[13px] leading-relaxed text-slate-300">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent-300" />
      <div>{children}</div>
    </div>
  );
}
