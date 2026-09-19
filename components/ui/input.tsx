"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

const FIELD_BASE =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 transition-colors duration-200 focus:border-brand-400/60 focus:bg-white/[0.06] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, "h-11", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_BASE, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(FIELD_BASE, "h-11 appearance-none bg-[#0b1120] pr-9", className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-slate-300">
        {label}
        {required ? <span className="text-brand-400">*</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[12px] font-medium text-rose-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-3.5 transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-white/16",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-200">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-500">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-brand-400/50 bg-brand-500/70" : "border-white/12 bg-white/[0.06]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}
