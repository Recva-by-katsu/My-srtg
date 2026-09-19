"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-r from-brand-500 via-accent-500 to-accent-600 shadow-[0_10px_30px_-12px_rgba(56,189,248,0.75)] hover:brightness-110 active:brightness-95 border border-white/10",
  secondary:
    "text-slate-100 bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-white/20 backdrop-blur",
  ghost: "text-slate-300 hover:text-white hover:bg-white/[0.06] border border-transparent",
  outline:
    "text-slate-200 border border-white/15 hover:border-brand-400/60 hover:text-white bg-transparent",
  danger:
    "text-white bg-rose-600/90 border border-rose-400/30 hover:bg-rose-500 shadow-[0_10px_28px_-14px_rgba(244,63,94,0.9)]",
  success:
    "text-white bg-emerald-600/90 border border-emerald-400/30 hover:bg-emerald-500 shadow-[0_10px_28px_-14px_rgba(16,185,129,0.9)]",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[11px] gap-1.5 rounded-lg",
  sm: "h-9 px-3.5 text-[13px] gap-2 rounded-xl",
  md: "h-11 px-5 text-sm gap-2 rounded-xl",
  lg: "h-13 px-7 text-[15px] gap-2.5 rounded-2xl",
  icon: "h-11 w-11 rounded-xl",
  "icon-sm": "h-9 w-9 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, fullWidth, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center font-medium tracking-tight",
        "transition-all duration-200 ease-out select-none",
        "disabled:opacity-45 disabled:pointer-events-none",
        "active:scale-[0.985]",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
