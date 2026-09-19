import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-accent-500/15 text-brand-300 ring-1 ring-white/10 animate-float">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
