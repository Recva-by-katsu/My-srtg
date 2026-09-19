"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Download,
  FileStack,
  Files,
  HardDrive,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTypeIcon } from "@/components/ui/file-icon";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { UsageBar } from "@/components/ui/usage-bar";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { OverviewResponse, SafeFile } from "@/lib/client/types";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatNumber, formatRelativeTime } from "@/lib/utils/format";

const STORAGE_STATUS_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Aktif", tone: "success" },
  disabled: { label: "Nonaktif", tone: "neutral" },
  error: { label: "Bermasalah", tone: "danger" },
};

function FileRow({ file }: { file: SafeFile }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <FileTypeIcon category={file.category} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white">{file.originalName || file.filename}</p>
        <p className="truncate text-[11px] text-slate-500">
          {formatBytes(file.size)}
          {file.storageName ? <span className="text-slate-600"> · {file.storageName}</span> : null}
        </p>
      </div>
      {file.visibility === "private" ? <Badge tone="warning">Privat</Badge> : null}
      <span className="hidden shrink-0 text-[11px] text-slate-500 sm:block">{formatRelativeTime(file.createdAt)}</span>
    </div>
  );
}

export function DashboardView() {
  const { toast } = useToast();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const result = await apiFetch<OverviewResponse>("/api/admin/overview");
      setData(result);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Gagal memuat ringkasan"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function initializeDatabase() {
    setInitializing(true);
    try {
      await apiFetch("/api/admin/database", { method: "POST", body: {} });
      toast({ tone: "success", title: "Skema database dipasang", description: "Tabel Katsu R2 Manager sudah siap digunakan." });
      await load("refresh");
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal menginisialisasi database", description: errorMessage(caught) });
    } finally {
      setInitializing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert tone="danger" title="Tidak dapat memuat ringkasan" action={<Button size="sm" variant="outline" onClick={() => void load("refresh")}>Coba lagi</Button>}>
        {error}
      </Alert>
    );
  }

  const pool = data?.pool;
  const stats = data?.stats;
  const config = data?.config;
  const database = data?.database;
  const blockingIssues = config?.issues.filter((issue) => issue.level === "error") ?? [];
  const advisoryIssues = config?.issues.filter((issue) => issue.level !== "error") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white sm:text-xl">Ringkasan storage pool</h2>
          <p className="mt-1 text-[13px] text-slate-400">
            Kondisi sistem, pemakaian kapasitas R2, dan file terbaru — semuanya dalam satu layar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load("refresh")} loading={refreshing}>
            <RefreshCw className="size-4" />
            Muat ulang
          </Button>
          <Link href="/admin/upload">
            <Button variant="primary" size="sm">
              <UploadCloud className="size-4" />
              Upload file
            </Button>
          </Link>
        </div>
      </div>

      {blockingIssues.length > 0 ? (
        <Alert tone="danger" title="Konfigurasi belum lengkap">
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px]">
            {blockingIssues.map((issue) => (
              <li key={issue.key}>
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px] text-brand-200">{issue.key}</code> {issue.message}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/setup">
              <Button size="xs" variant="secondary">Buka Setup Assistant</Button>
            </Link>
            <Link href="/docs/environment-variables">
              <Button size="xs" variant="ghost">Lihat panduan</Button>
            </Link>
          </div>
        </Alert>
      ) : null}

      {database && !database.schemaInitialized ? (
        <Alert
          tone="warning"
          title="Skema database belum dipasang"
          action={
            <Button size="xs" variant="secondary" onClick={initializeDatabase} loading={initializing}>
              Pasang sekarang
            </Button>
          }
        >
          Tabel <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">files</code>,{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">storages</code>, dan{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">upload_sessions</code> belum ada di database{" "}
          {database.driver.toUpperCase()}. Klik tombol di samping untuk memasangnya otomatis tanpa terminal.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total file" value={formatNumber(stats?.totalFiles ?? 0)} icon={Files} hint={`${formatNumber(stats?.publicFiles ?? 0)} file publik`} />
        <StatCard label="Total ukuran" value={formatBytes(stats?.totalBytes ?? 0)} icon={FileStack} tone="accent" hint="Terpakai di seluruh storage" />
        <StatCard label="Total unduhan" value={formatNumber(stats?.totalDownloads ?? 0)} icon={Download} tone="success" hint="Sejak pertama kali dijalankan" />
        <StatCard
          label="Storage R2"
          value={`${formatNumber(pool?.activeCount ?? 0)} aktif`}
          icon={ServerCog}
          tone={(pool?.degradedCount ?? 0) > 0 ? "warning" : "brand"}
          hint={(pool?.degradedCount ?? 0) > 0 ? `${pool?.degradedCount} bermasalah/nonaktif` : `${formatNumber(pool?.storages.length ?? 0)} storage terdaftar`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Kapasitas storage pool"
            description={`${formatBytes(pool?.totalUsedBytes ?? 0)} terpakai dari ${formatBytes(pool?.totalCapacityBytes ?? 0)} total kapasitas`}
            icon={<HardDrive className="size-4 text-brand-300" />}
            action={
              <Link href="/admin/storage">
                <Button size="xs" variant="ghost">
                  Kelola
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-4">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
                <span className="text-slate-400">
                  Sisa ruang: <span className="font-semibold text-white">{formatBytes(pool?.totalFreeBytes ?? 0)}</span>
                </span>
                <span className="text-slate-500 tabular-nums">{Math.round((pool?.usagePercent ?? 0) * 10) / 10}% terpakai</span>
              </div>
              <UsageBar used={pool?.totalUsedBytes ?? 0} limit={pool?.totalCapacityBytes ?? 0} />
            </div>

            {pool && pool.storages.length > 0 ? (
              <ul className="space-y-2">
                {pool.storages.map((storage) => {
                  const status = STORAGE_STATUS_LABEL[storage.status] ?? { label: storage.status, tone: "neutral" as const };
                  return (
                    <li key={storage.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-white">{storage.name}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            bucket <span className="text-slate-400">{storage.bucket}</span> · prioritas {storage.priority}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="text-[11px] text-slate-400 tabular-nums">{formatBytes(storage.freeBytes)} bebas</span>
                        </div>
                      </div>
                      <UsageBar used={storage.usedBytes} limit={storage.limitBytes} compact />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<ServerCog className="size-6" />}
                title="Belum ada storage R2"
                description="Tambahkan akun Cloudflare R2 pertama Anda agar sistem bisa mulai menyimpan file."
                action={
                  <Link href="/admin/storage">
                    <Button size="sm" variant="primary">
                      Tambah storage
                    </Button>
                  </Link>
                }
              />
            )}

            {pool && pool.warnings.length > 0 ? (
              <div className="space-y-1.5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-3.5">
                {pool.warnings.map((warning) => (
                  <p key={warning} className="flex items-start gap-2 text-[12px] text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Diagnostik sistem" icon={<Activity className="size-4 text-accent-300" />} />
            <CardBody className="space-y-3">
              <dl className="space-y-2 text-[12px]">
                {[
                  { label: "Driver database", value: (database?.driver ?? "-").toUpperCase() },
                  { label: "Skema", value: database?.schemaInitialized ? "Terpasang" : "Belum dipasang" },
                  { label: "Mode unduhan", value: config?.downloadMode ?? "-" },
                  { label: "Kredensial", value: config?.credentialsEncrypted ? "Terenkripsi AES-GCM" : "Belum dienkripsi" },
                  { label: "Mode demo", value: config?.demoMode ? "Aktif" : "Nonaktif" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0">
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="truncate text-right font-medium text-slate-200">{row.value}</dd>
                  </div>
                ))}
              </dl>

              {config?.ready ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-[12px] text-emerald-200">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Konfigurasi lengkap dan siap produksi.
                </div>
              ) : null}

              {advisoryIssues.length > 0 ? (
                <ul className="space-y-1.5">
                  {advisoryIssues.slice(0, 4).map((issue) => (
                    <li key={issue.key} className={cn("flex items-start gap-2 text-[11px]", issue.level === "warn" ? "text-amber-200" : "text-slate-400")}>
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{issue.key}</code> {issue.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Link href="/admin/settings">
                <Button size="sm" variant="outline" fullWidth className="justify-center">
                  <Database className="size-4" />
                  Pengaturan &amp; diagnostik
                </Button>
              </Link>
            </CardBody>
          </Card>

          {data && data.resumableUploads.length > 0 ? (
            <Card>
              <CardHeader
                title="Upload tertunda"
                description={`${data.resumableUploads.length} sesi multipart belum selesai`}
                icon={<UploadCloud className="size-4 text-brand-300" />}
                action={
                  <Link href="/admin/upload">
                    <Button size="xs" variant="ghost">
                      Lanjutkan
                      <ArrowUpRight className="size-3.5" />
                    </Button>
                  </Link>
                }
              />
              <CardBody>
                <ul className="space-y-2">
                  {data.resumableUploads.slice(0, 4).map((upload) => {
                    const percent = upload.partsTotal > 0 ? Math.round((upload.partsUploaded / upload.partsTotal) * 100) : 0;
                    return (
                      <li key={upload.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[12px] font-medium text-white">{upload.filename}</p>
                          <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{percent}%</span>
                        </div>
                        <UsageBar used={upload.partsUploaded} limit={upload.partsTotal} showLabels={false} compact />
                        <p className="text-[10px] text-slate-500">
                          {formatBytes(upload.size)} · {upload.storageName} · {formatRelativeTime(upload.updatedAt)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="File terbaru"
            icon={<Files className="size-4 text-brand-300" />}
            action={
              <Link href="/admin/files">
                <Button size="xs" variant="ghost">
                  Semua file
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            }
          />
          <CardBody>
            {data && data.recentFiles.length > 0 ? (
              <ul className="space-y-0.5">
                {data.recentFiles.map((file) => (
                  <li key={file.id}>
                    <FileRow file={file} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Files className="size-6" />}
                title="Belum ada file"
                description="File yang Anda unggah akan muncul di sini beserta storage tujuan dan tautan unduhnya."
                action={
                  <Link href="/admin/upload">
                    <Button size="sm" variant="primary">
                      Upload pertama
                    </Button>
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Paling banyak diunduh" icon={<Download className="size-4 text-emerald-300" />} />
          <CardBody>
            {data && data.topFiles.length > 0 ? (
              <ul className="space-y-0.5">
                {data.topFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]">
                    <FileTypeIcon category={file.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-white">{file.originalName || file.filename}</p>
                      <p className="truncate text-[11px] text-slate-500">{formatBytes(file.size)}</p>
                    </div>
                    <Badge tone="success">{formatNumber(file.downloadCount)} unduhan</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Download className="size-6" />} title="Belum ada unduhan" description="Statistik unduhan akan tampil setelah file publik diakses pengunjung." />
            )}
          </CardBody>
        </Card>
      </div>

      {error ? (
        <Alert tone="warning" title="Data mungkin tidak terbaru">
          {error}
        </Alert>
      ) : null}
      {loading || refreshing ? <SkeletonRows rows={1} className="h-2" /> : null}
    </div>
  );
}
