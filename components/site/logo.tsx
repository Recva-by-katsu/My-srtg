import { cn } from "@/lib/utils/cn";

export function Logo({
  className,
  withWordmark = true,
  subtitle,
}: {
  className?: string;
  withWordmark?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-9 shrink-0 place-items-center">
        <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
          <defs>
            <linearGradient id="katsu-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
          </defs>
          <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#katsu-mark)" opacity="0.16" />
          <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" stroke="url(#katsu-mark)" strokeOpacity="0.55" />
          <path
            d="M11 21.4c-2.3 0-4.1-1.8-4.1-4.1 0-2.1 1.6-3.8 3.6-4.1C11.4 10.3 14.2 8 17.6 8c3.7 0 6.8 2.8 7.2 6.5 2.4.3 4.3 2.4 4.3 4.9 0 2.7-2.2 4.9-4.9 4.9H11z"
            fill="url(#katsu-mark)"
          />
          <path
            d="M20 18.5v10m0 0-3.8-3.8M20 28.5l3.8-3.8"
            stroke="#f8fafc"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {withWordmark ? (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[15px] font-semibold tracking-tight text-white">
            Katsu <span className="gradient-text">R2 Manager</span>
          </span>
          {subtitle ? (
            <span className="truncate text-[11px] font-medium text-slate-500">{subtitle}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
