"use client";

import { CheckCircle2, CircleDashed, Info, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatRelativeTime } from "@/lib/utils/format";
import type { ConnectionTest } from "@/lib/client/types";

export function ConnectionTestPanel({ test, running }: { test: ConnectionTest | null; running?: boolean }) {
  if (running && !test) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <Loader2 className="size-4 animate-spin text-brand-300" />
            <div className="h-3 flex-1 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    );
  }

  if (!test) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] text-slate-400">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-300" />
        <p>
          Tes koneksi menjalankan empat langkah: memastikan bucket dapat diakses, membaca daftar objek, menulis file uji kecil, lalu
          menghapusnya kembali. Tidak ada data Anda yang diubah secara permanen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3",
          test.ok ? "border-emerald-400/25 bg-emerald-500/[0.07]" : "border-rose-400/25 bg-rose-500/[0.07]",
        )}
      >
        <div className="flex items-center gap-2 text-[13px] font-medium">
          {test.ok ? <CheckCircle2 className="size-4 text-emerald-300" /> : <XCircle className="size-4 text-rose-300" />}
          <span className={test.ok ? "text-emerald-200" : "text-rose-200"}>
            {test.ok ? "Koneksi berhasil diverifikasi" : "Koneksi gagal"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="truncate">
            {test.storageName} · bucket <span className="text-slate-300">{test.bucket}</span>
          </span>
          <Badge tone="neutral">{formatRelativeTime(test.checkedAt)}</Badge>
        </div>
      </div>

      <ol className="space-y-2">
        {test.steps.map((step, index) => (
          <li
            key={step.name}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              step.ok ? "border-white/[0.06] bg-white/[0.02]" : "border-rose-400/20 bg-rose-500/[0.05]",
            )}
          >
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-300 tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-white">{step.label}</p>
                <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{step.durationMs} ms</span>
              </div>
              <p className={cn("mt-0.5 text-[12px] leading-relaxed", step.ok ? "text-slate-400" : "text-rose-200")}>{step.message}</p>
            </div>
            {step.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" />
            )}
          </li>
        ))}
      </ol>

      {typeof test.measuredBytes === "number" || typeof test.measuredObjects === "number" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-slate-400">
          <CircleDashed className="size-4 text-brand-300" />
          Terukur di bucket:
          {typeof test.measuredObjects === "number" ? <span className="font-medium text-slate-200">{test.measuredObjects} objek</span> : null}
          {typeof test.measuredBytes === "number" ? <span className="font-medium text-slate-200">{formatBytes(test.measuredBytes)}</span> : null}
        </div>
      ) : null}

      {test.error ? (
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.05] p-3 text-[12px] text-rose-200">
          <p className="font-medium">
            {test.error.code} {test.error.status ? `(HTTP ${test.error.status})` : null}
          </p>
          <p className="mt-1 leading-relaxed">{test.error.message}</p>
          <p className="mt-1 text-[11px] text-rose-300/70">
            Periksa Account ID, nama bucket, dan pastikan API Token punya izin <code className="rounded bg-white/[0.06] px-1">R2:Edit</code>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
