"use client";

import Link from "next/link";
import { Download, Eye } from "lucide-react";
import type { PublicFile } from "@/lib/client/types";
import { FileTypeIcon } from "@/components/ui/file-icon";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { fileCategoryLabel, formatBytes, formatRelativeTime } from "@/lib/utils/format";
import type { FileCategory } from "@/lib/utils/format";

export function FileCard({ file, origin }: { file: PublicFile; origin: string }) {
  const { toast } = useToast();
  const downloadUrl = `${origin}/download/${file.downloadId}`;

  return (
    <article className="glass glass-hover group relative flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex items-start gap-3.5">
        <FileTypeIcon category={(file.category as FileCategory) ?? "other"} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-white" title={file.filename}>
            {file.filename}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
            <span className="font-medium text-brand-300">{formatBytes(file.size)}</span>
            <span className="text-slate-600">•</span>
            <span>{fileCategoryLabel((file.category as FileCategory) ?? "other")}</span>
            <span className="text-slate-600">•</span>
            <span>{formatRelativeTime(file.createdAt)}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <Download className="size-3.5" />
          {file.downloadCount.toLocaleString("id-ID")} unduhan
        </span>

        <div className="flex items-center gap-1.5">
          <CopyButton
            compact
            value={downloadUrl}
            label="link download"
            onCopied={() => toast({ tone: "success", title: "Link disalin", description: downloadUrl })}
          />
          <Link
            href={`/file/${file.downloadId}`}
            className="inline-grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-all hover:border-brand-400/40 hover:text-white active:scale-95"
            aria-label={`Lihat detail ${file.filename}`}
            title="Detail file"
          >
            <Eye className="size-3.5" />
          </Link>
          <a
            href={downloadUrl}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-3 text-[12px] font-semibold text-white shadow-[0_8px_24px_-12px_rgba(56,189,248,0.9)] transition-all hover:brightness-110 active:scale-95"
          >
            <Download className="size-3.5" />
            Download
          </a>
        </div>
      </div>

      <span className="pointer-events-none absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </article>
  );
}
