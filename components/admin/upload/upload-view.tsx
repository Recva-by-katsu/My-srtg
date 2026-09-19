"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Eraser, Gauge, Pause, Play, ServerCog, Settings2, UploadCloud } from "lucide-react";
import { UploadDropzone } from "@/components/admin/upload/upload-dropzone";
import { UploadQueue } from "@/components/admin/upload/upload-queue";
import { UploadSettingsModal, type UploadDefaults } from "@/components/admin/upload/upload-settings-modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { SafeStorage } from "@/lib/client/types";
import {
  DEFAULT_SETTINGS,
  getUploadManager,
  type UploadItem,
  type UploadManagerSettings,
} from "@/lib/upload/uploader";
import { formatBytes, formatBytesPerSecond, formatNumber } from "@/lib/utils/format";

const SETTINGS_KEY = "katsu-upload-settings";
const DEFAULTS_KEY = "katsu-upload-defaults";

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function UploadView() {
  const { toast } = useToast();
  const managerRef = useRef<ReturnType<typeof getUploadManager> | null>(null);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [stats, setStats] = useState(() => ({
    total: 0,
    active: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    bytesPerSecond: 0,
  }));
  const [settings, setSettings] = useState<UploadManagerSettings>(DEFAULT_SETTINGS);
  const [defaults, setDefaults] = useState<UploadDefaults>({ visibility: "public", preferredStorageId: null });
  const [storages, setStorages] = useState<SafeStorage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const sync = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    setItems(manager.list());
    setStats(manager.stats());
    setSettings(manager.getSettings());
  }, []);

  useEffect(() => {
    const manager = getUploadManager();
    managerRef.current = manager;

    const storedSettings = readStored<UploadManagerSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
    const storedDefaults = readStored<UploadDefaults>(DEFAULTS_KEY, { visibility: "public", preferredStorageId: null });
    manager.updateSettings(storedSettings);
    setDefaults(storedDefaults);

    const unsubscribe = manager.subscribe(sync);
    sync();

    void (async () => {
      const restored = await manager.restore();
      const merged = await manager.reconcileWithServer();
      sync();
      setHydrating(false);
      if (restored > 0 || merged > 0) {
        toast({
          tone: "info",
          title: "Antrean dipulihkan",
          description: `${restored} entri lokal dan ${merged} sesi server berhasil dimuat kembali.`,
        });
      }
    })();

    return unsubscribe;
  }, [sync, toast]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await apiFetch<{ storages: SafeStorage[] }>("/api/admin/storages");
        setStorages(result.storages);
      } catch (caught) {
        toast({ tone: "warning", title: "Daftar storage tidak dapat dimuat", description: errorMessage(caught) });
      }
    })();
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
  }, [defaults]);

  const nextTarget = useMemo(() => {
    if (defaults.preferredStorageId) {
      return storages.find((storage) => storage.id === defaults.preferredStorageId) ?? null;
    }
    const active = storages.filter((storage) => storage.status === "active");
    return [...active].sort((a, b) => b.freeBytes - a.freeBytes || a.priority - b.priority)[0] ?? null;
  }, [storages, defaults.preferredStorageId]);

  const poolFree = useMemo(() => storages.filter((s) => s.status === "active").reduce((sum, s) => sum + s.freeBytes, 0), [storages]);
  const overallPercent = stats.bytesTotal > 0 ? (stats.bytesUploaded / stats.bytesTotal) * 100 : 0;

  function changeSettings(patch: Partial<UploadManagerSettings>) {
    managerRef.current?.updateSettings(patch);
    sync();
  }

  function changeDefaults(patch: Partial<UploadDefaults>) {
    setDefaults((current) => ({ ...current, ...patch }));
  }

  async function handleFiles(files: File[]) {
    const manager = managerRef.current;
    if (!manager) return;
    if (storages.length === 0) {
      toast({
        tone: "warning",
        title: "Belum ada storage R2",
        description: "Tambahkan storage lebih dulu di halaman Storage R2 sebelum mengunggah file.",
      });
      return;
    }
    try {
      const added = await manager.addFiles(files, {
        visibility: defaults.visibility,
        preferredStorageId: defaults.preferredStorageId,
      });
      sync();
      const skipped = files.length - added;
      toast({
        tone: added > 0 ? "success" : "warning",
        title: added > 0 ? `${formatNumber(added)} file masuk antrean` : "Tidak ada file yang ditambahkan",
        description:
          skipped > 0
            ? `${skipped} file berukuran 0 byte dilewati.`
            : defaults.visibility === "private"
              ? "File diunggah sebagai privat dan tidak muncul di Download Center."
              : undefined,
      });
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal menambahkan file", description: errorMessage(caught) });
    }
  }

  async function handleAttach(id: string, file: File) {
    const manager = managerRef.current;
    if (!manager) return;
    const ok = await manager.attachFile(id, file);
    sync();
    toast(
      ok
        ? { tone: "success", title: "File dipasang kembali", description: `${file.name} melanjutkan sesi multipart yang tersimpan.` }
        : { tone: "danger", title: "Gagal memasang file", description: "Entri antrean tidak ditemukan." },
    );
  }

  if (hydrating && items.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white sm:text-xl">Upload ke storage pool</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-400">
            Data dikirim langsung dari browser ke Cloudflare R2 secara multipart, jadi file berukuran gigabyte tidak membebani memori
            perangkat maupun server.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-4" />
          Pengaturan upload
        </Button>
      </div>

      {storages.length === 0 ? (
        <Alert
          tone="warning"
          title="Belum ada storage R2"
          action={
            <Link href="/admin/storage">
              <Button size="xs" variant="secondary">
                Tambah storage
              </Button>
            </Link>
          }
        >
          Upload membutuhkan minimal satu bucket R2 yang terhubung. Buka halaman Storage R2 untuk menambahkan akun pertama Anda.
        </Alert>
      ) : null}

      <UploadDropzone onFiles={handleFiles} disabled={hydrating} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Antrean upload"
            description={
              stats.total > 0
                ? `${formatNumber(stats.active)} berjalan · ${formatNumber(stats.queued)} menunggu · ${formatNumber(stats.completed)} selesai · ${formatNumber(stats.failed)} gagal`
                : "Belum ada file dalam antrean"
            }
            icon={<UploadCloud className="size-4 text-brand-300" />}
          />
          <CardBody className="space-y-4">
            {stats.total > 0 ? (
              <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                  <span className="text-slate-400">
                    Total progres:{" "}
                    <span className="font-semibold text-white tabular-nums">
                      {formatBytes(stats.bytesUploaded)} / {formatBytes(stats.bytesTotal)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-slate-400">
                    {stats.bytesPerSecond > 0 ? (
                      <span className="flex items-center gap-1.5 text-brand-300 tabular-nums">
                        <Gauge className="size-3.5" />
                        {formatBytesPerSecond(stats.bytesPerSecond)}
                      </span>
                    ) : null}
                    <span className="tabular-nums">{Math.round(overallPercent)}%</span>
                  </span>
                </div>
                <Progress value={overallPercent} size="sm" />
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="ghost" onClick={() => managerRef.current?.pauseAll()}>
                    <Pause className="size-3.5" />
                    Jeda semua
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => managerRef.current?.resumeAll()}>
                    <Play className="size-3.5" />
                    Lanjutkan semua
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="ml-auto"
                    onClick={async () => {
                      await managerRef.current?.clearFinished();
                      sync();
                    }}
                  >
                    <Eraser className="size-3.5" />
                    Bersihkan yang selesai
                  </Button>
                </div>
              </div>
            ) : null}

            <UploadQueue
              items={items}
              onPause={(id) => {
                managerRef.current?.pause(id);
                sync();
              }}
              onResume={(id) => {
                managerRef.current?.resume(id);
                sync();
              }}
              onCancel={async (id) => {
                await managerRef.current?.cancel(id);
                sync();
              }}
              onRemove={async (id) => {
                await managerRef.current?.remove(id);
                sync();
              }}
              onAttach={handleAttach}
            />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Tujuan berikutnya" icon={<ServerCog className="size-4 text-accent-300" />} />
            <CardBody className="space-y-3">
              {nextTarget ? (
                <>
                  <div>
                    <p className="truncate text-[15px] font-semibold text-white">{nextTarget.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      bucket {nextTarget.bucket} · prioritas {nextTarget.priority}
                    </p>
                  </div>
                  <dl className="space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5">
                      <dt className="text-slate-500">Ruang bebas</dt>
                      <dd className="font-medium text-emerald-300 tabular-nums">{formatBytes(nextTarget.freeBytes)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5">
                      <dt className="text-slate-500">Terpakai</dt>
                      <dd className="font-medium text-slate-200 tabular-nums">
                        {formatBytes(nextTarget.usedBytes)} / {formatBytes(nextTarget.limitBytes)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Tingkat pemakaian</dt>
                      <dd className="font-medium text-slate-200 tabular-nums">{Math.round(nextTarget.usagePercent * 10) / 10}%</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-[12px] leading-relaxed text-slate-400">
                  Tidak ada storage aktif yang bisa dipilih. Aktifkan storage atau tambahkan yang baru agar upload dapat berjalan.
                </p>
              )}

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-slate-400">
                Total ruang bebas pool: <span className="font-semibold text-white">{formatBytes(poolFree)}</span> dari{" "}
                {formatNumber(storages.length)} storage terdaftar.
              </div>

              <Link href="/admin/storage">
                <Button size="sm" variant="outline" fullWidth className="justify-center">
                  Kelola storage
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Profil upload aktif" icon={<Settings2 className="size-4 text-brand-300" />} />
            <CardBody className="space-y-2 text-[12px]">
              {[
                { label: "Ukuran bagian", value: `${settings.partSizeMb} MB` },
                { label: "File bersamaan", value: `${settings.fileConcurrency}` },
                { label: "Bagian bersamaan", value: `${settings.partConcurrency}` },
                { label: "Visibilitas default", value: defaults.visibility === "public" ? "Publik" : "Privat" },
                { label: "Storage pilihan", value: defaults.preferredStorageId ? (nextTarget?.name ?? "Dipilih manual") : "Auto" },
                { label: "Mulai otomatis", value: settings.autoStart ? "Ya" : "Tidak" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="truncate font-medium text-slate-200">{row.value}</span>
                </div>
              ))}
              <Button size="xs" variant="ghost" className="mt-2 w-full justify-center" onClick={() => setSettingsOpen(true)}>
                Ubah pengaturan
              </Button>
            </CardBody>
          </Card>

          <Alert tone="info" title="Upload bisa dijeda dan dilanjutkan">
            <p className="text-[12px] leading-relaxed">
              Antrean disimpan di perangkat ini dan sesi multipart dicatat di server. Menutup tab, kehilangan sinyal, atau mereload
              halaman tidak menghapus progres — bagian yang sudah terkirim tidak diulang. Lihat{" "}
              <Link href="/docs/upload-guide" className="font-medium text-brand-300 underline underline-offset-2">
                panduan upload
              </Link>
              .
            </p>
          </Alert>
        </div>
      </div>

      <UploadSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={changeSettings}
        defaults={defaults}
        onDefaultsChange={changeDefaults}
        storages={storages}
      />
    </div>
  );
}
