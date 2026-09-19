"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function useClipboard(resetAfter = 1800) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          // Fallback for older mobile browsers / non-secure contexts.
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetAfter);
        return true;
      } catch {
        return false;
      }
    },
    [resetAfter],
  );

  return { copied, copy };
}

export function CopyButton({
  value,
  label,
  className,
  onCopied,
  compact = false,
}: {
  value: string;
  label?: string;
  className?: string;
  onCopied?: (value: string) => void;
  compact?: boolean;
}) {
  const { copied, copy } = useClipboard();

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copy(value);
        if (ok && onCopied) onCopied(value);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[12px] font-medium text-slate-300 transition-all hover:border-brand-400/40 hover:text-white active:scale-95",
        compact ? "size-8 justify-center" : "h-8 px-2.5",
        copied && "border-emerald-400/40 text-emerald-300",
        className,
      )}
      aria-label={label ? `Salin ${label}` : "Salin"}
      title={label ? `Salin ${label}` : "Salin"}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {!compact && (label ?? (copied ? "Tersalin" : "Salin"))}
    </button>
  );
}
