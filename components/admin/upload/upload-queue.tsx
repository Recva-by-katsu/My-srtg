"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  Loader2,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTypeIcon } from "@/components/ui/file-icon";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";
import { categorizeFile, formatBytes, formatBytesPerSecond, formatDuration } from "@/lib/utils/format";
import type { UploadItem, UploadItemStatus } from "@/lib/upload/uploader";

const STATUS_META: Record<UploadItemStatus, { label: string; tone: "brand" | "success" | "warning" | "danger" | "neutral" | "accent" }> = {
  queued: { label: "Menunggu", tone: "neutral" },
  starting: { label: "Menyiapkan", tone: "accent" },
  uploading: { label: "Mengunggah", tone: "brand" },
  paused: { label: "Dijeda", tone: "warning" },
  completing: { label: "Menyelesaikan", tone: "accent" },
  completed: { label: "Selesai", tone: "success" },
  error: { label: "Gagal", tone: "danger" },
  canceled: { label: "Dibatalkan", tone: "neutral" },
};

function etaLabel(item: UploadItem): string | null {
  if (item.bytesPerSecond <= 0) return null;
  const remaining = Math.max(0, item.size - item.bytesUploaded);
  if (remaining === 0) return null;
  return `sisa ${formatDuration(Math.round(remaining / item.bytesPerSecond))}`;
}

export function UploadQueueItem({
  item,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onAttach,
}: {
  item: UploadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onAttach: (id: string, file: File) => void;
}) {
  const attachRef = useRef<HTMLInputElement | null>(null);
  const status = STATUS_META[item.status];
  const percent = item.size > 0 ? Math.min(100, (item.bytesUploaded / item.size) * 100) : 0;
  const active = ["starting", "uploading", "completing"].includes(item.status);
  const finished = ["completed", "canceled"].includes(item.status);
  const needsFile = !item.file;
  const eta = etaLabel(item);

  return (
    <li
      className={cn(
        "glass rounded-2xl p-4 transition-all",
        item.status === "completed" && "border-emerald-400/20",
        item.status === "error" && "border-rose-400/25",
      )}
    >
      <div className="flex items-start gap-3">
        <FileTypeIcon category={categorizeFile(item.filename, item.contentType)} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-white" title={item.filename}>
              {item.filename}
            </p>
            <Badge tone={status.tone}>{status.label}</Badge>
            {item.visibility === "private" ? <Badge tone="warning">Privat</Badge> : null}
          </div>

          <p className="mt-1 truncate text-[11px] text-slate-500">
            {formatBytes(item.size)}
            {item.partsTotal > 0 ? ` · bagian ${item.uploadedParts.length}/${item.partsTotal} @ ${formatBytes(item.partSize)}` : null}
            {item.storageName ? <span className="text-slate-400"> · {item.storageName}</span> : null}
            {item.attempts > 0 ? <span className="text-amber-300/80"> · percobaan {item.attempts}</span> : null}
          </p>

          {!finished ? (
            <div className="mt-2.5 space-y-1.5">
              <Progress value={percent} size="sm" indeterminate={item.status === "starting" || item.status === "completing"} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400 tabular-nums">
                  {formatBytes(item.bytesUploaded)} / {formatBytes(item.size)}
                  <span className="text-slate-500"> ({Math.round(percent)}%)</span>
                </span>
                <span className="flex items-center gap-2 text-slate-500">
                  {item.bytesPerSecond > 0 ? (
                    <>
                      <span className="text-brand-300 tabular-nums">{formatBytesPerSecond(item.bytesPerSecond)}</span>
                      {eta ? <span className="tabular-nums">{eta}</span> : null}
                    </>
                  ) : active ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> menyiapkan…
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}

          {item.selectionReason ? (
            <p className="mt-2 truncate text-[11px] text-slate-500" title={item.selectionReason}>
              Tujuan: {item.selectionReason}
            </p>
          ) : null}

          {item.error ? (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-2.5 text-[11px] leading-relaxed text-rose-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {item.error}
            </p>
          ) : null}

          {item.status === "completed" && item.downloadUrl ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Link href={item.downloadUrl} target="_blank" rel="noreferrer">
                <Button size="xs" variant="success">
                  <ExternalLink className="size-3.5" />
                  Buka tautan unduhan
                </Button>
              </Link>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Tersimpan di {item.storageName ?? "storage pool"}
              </span>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {needsFile && !finished ? (
              <Button size="xs" variant="secondary" onClick={() => attachRef.current?.click()}>
                <Paperclip className="size-3.5" />
                Pilih ulang file
              </Button>
            ) : null}

            {active ? (
              <Button size="xs" variant="ghost" onClick={() => onPause(item.id)}>
                <Pause className="size-3.5" />
                Jeda
              </Button>
            ) : null}

            {!active && !finished ? (
              <Button size="xs" variant="ghost" onClick={() => onResume(item.id)} disabled={needsFile}>
                <Play className="size-3.5" />
                {item.status === "error" ? "Coba lagi" : "Lanjutkan"}
              </Button>
            ) : null}

            {item.status === "error" && !needsFile ? (
              <Button size="xs" variant="ghost" onClick={() => onResume(item.id)}>
                <RotateCcw className="size-3.5" />
                Ulangi
              </Button>
            ) : null}

            {!finished ? (
              <Button size="xs" variant="ghost" onClick={() => onCancel(item.id)}>
                <Ban className="size-3.5" />
                Batalkan
              </Button>
            ) : null}

            <Button size="xs" variant="ghost" className={cn("text-slate-500 hover:text-rose-300", !finished && "ml-auto")} onClick={() => onRemove(item.id)}>
              <Trash2 className="size-3.5" />
              Hapus dari daftar
            </Button>
          </div>
        </div>

        {active ? (
          <button
            type="button"
            aria-label={`Batalkan ${item.filename}`}
            onClick={() => onCancel(item.id)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-300"
          >
            <X className="size-4" />
          </button>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center text-slate-600">
            <CircleSlash className="size-4" />
          </span>
        )}
      </div>

      <input
        ref={attachRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onAttach(item.id, file);
        }}
      />
    </li>
  );
}

export function UploadQueue({
  items,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onAttach,
}: {
  items: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onAttach: (id: string, file: File) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="size-6" />}
        title="Antrean kosong"
        description="File yang Anda pilih akan muncul di sini lengkap dengan kecepatan, perkiraan waktu selesai, dan storage tujuannya."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <UploadQueueItem
          key={item.id}
          item={item}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
          onRemove={onRemove}
          onAttach={onAttach}
        />
      ))}
    </ul>
  );
}
