"use client";

import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className="group relative my-5 overflow-hidden rounded-2xl border border-white/10 bg-[#070b16]/90">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-2">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Terminal className="size-3.5 text-brand-300" />
          {lang}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:border-brand-400/40 hover:text-white active:scale-95"
          aria-label="Salin kode"
        >
          {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </figcaption>
      <pre className="scrollbar-thin overflow-x-auto p-4 text-[12.5px] leading-6 text-slate-200">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
