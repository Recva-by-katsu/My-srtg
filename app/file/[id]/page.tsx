import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, Hash, HardDrive, Tag } from "lucide-react";
import { getConfig, resolveBaseUrl } from "@/lib/config/env";
import { getDatabase, toPublicFile } from "@/lib/db";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PublicFileActions } from "@/components/public/public-file-actions";
import { FileTypeIcon } from "@/components/ui/file-icon";
import { Badge } from "@/components/ui/badge";
import { fileCategoryLabel, formatBytes, formatDate, formatNumber } from "@/lib/utils/format";
import type { FileCategory } from "@/lib/utils/format";
import { isValidDownloadId } from "@/lib/utils/id";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function loadFile(downloadId: string) {
  if (!isValidDownloadId(downloadId)) return null;
  const db = await getDatabase();
  const file = await db.getFileByDownloadId(downloadId);
  if (!file || file.visibility !== "public") return null;
  return file;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const file = await loadFile(id);
  if (!file) return { title: "File tidak ditemukan" };
  return {
    title: file.filename,
    description: `Unduh ${file.filename} (${formatBytes(file.size)}) dari ${getConfig().app.name}.`,
  };
}

export default async function PublicFilePage({ params }: PageProps) {
  const { id } = await params;
  const file = await loadFile(id);
  if (!file) notFound();

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  const origin = resolveBaseUrl(host ? `${proto}://${host}` : undefined);
  const publicFile = toPublicFile(file);
  const downloadUrl = `${origin}/download/${file.downloadId}`;

  const facts = [
    { label: "Ukuran", value: formatBytes(file.size), icon: HardDrive },
    { label: "Tipe", value: fileCategoryLabel((file.category as FileCategory) ?? "other"), icon: Tag },
    { label: "Diunggah", value: formatDate(file.createdAt), icon: CalendarDays },
    { label: "Unduhan", value: formatNumber(file.downloadCount), icon: Download },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/#files"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Download Center
        </Link>

        <div className="glass mt-6 overflow-hidden rounded-3xl">
          <div className="flex flex-col gap-5 border-b border-white/5 p-6 sm:flex-row sm:items-center sm:p-8">
            <FileTypeIcon category={(file.category as FileCategory) ?? "other"} size="lg" />
            <div className="min-w-0 flex-1">
              <Badge tone="brand" className="mb-2">
                {publicFile.contentType || "application/octet-stream"}
              </Badge>
              <h1 className="break-words text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {file.filename}
              </h1>
              <p className="mt-1.5 text-[13px] text-slate-400">
                ID publik <span className="font-mono text-brand-300">{file.downloadId}</span> · dibagikan lewat{" "}
                <span className="font-mono text-slate-300">/download/{file.downloadId}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-px bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => {
              const Icon = fact.icon;
              return (
                <div key={fact.label} className="bg-abyss/80 p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="size-3.5 text-brand-300" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{fact.label}</span>
                  </div>
                  <p className="mt-1.5 text-[15px] font-semibold text-white">{fact.value}</p>
                </div>
              );
            })}
          </div>

          <div className="p-6 sm:p-8">
            <PublicFileActions file={publicFile} downloadUrl={downloadUrl} />

            <div className="mt-6 grid gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-[13px] leading-relaxed text-slate-400 sm:grid-cols-3">
              <p>
                <span className="font-semibold text-slate-200">Resume aktif.</span> Transfer mendukung HTTP
                Range request, jadi unduhan yang terputus bisa dilanjutkan.
              </p>
              <p>
                <span className="font-semibold text-slate-200">Lokasi disembunyikan.</span> Tidak ada account
                id, bucket, atau object key yang terlihat dari halaman ini.
              </p>
              <p>
                <span className="font-semibold text-slate-200">Hash verifikasi.</span> ETag tersedia{" "}
                {file.etag ? <span className="font-mono text-brand-300">{file.etag.slice(0, 12)}…</span> : "untuk file multipart"}.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 flex items-center gap-2 text-center text-[12px] text-slate-600 sm:justify-center">
          <Hash className="size-3.5" />
          File dilayani dari storage pool {getConfig().app.name}.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
