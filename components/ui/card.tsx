import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({
  className,
  hover = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl",
        hover && "glass-hover",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-white/5 p-5", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 text-brand-300 ring-1 ring-white/10">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-white/5 p-4", className)} {...props} />;
}
