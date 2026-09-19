"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Ban,
  CircleCheck,
  Cloud,
  Info,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  ServerCog,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { ConnectionTestPanel } from "@/components/admin/storage/connection-test-panel";
import { StorageFormModal } from "@/components/admin/storage/storage-form-modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageBar } from "@/components/ui/usage-bar";
import { Switch } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/client/api";
import type { ConnectionTest, SafeStorage } from "@/lib/client/types";
import { formatBytes, formatNumber, formatRelativeTime } from "@/lib/utils/format";

const STATUS_META: Record<SafeStorage["status"], { label: string; tone: "success" | "neutral" | "danger" }> = {
  active: { label: "Aktif", tone: "success" },
  disabled: { label: "Nonaktif", tone: "neutral" },
  error: { label: "Bermasalah", tone: "danger" },
};

interface TestState {
  storage: SafeStorage;
  test: ConnectionTest | null;
  running: boolean;
}

interface DeleteState {
  storage: SafeStorage;
  running: boolean;
  conflictFiles: number;
  force: boolean;
}

export function StorageManager() {
  const { toast } = useToast();
  const [storages, setStorages] = useState<SafeStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SafeStorage | null>(null);
  const [testState, setTestState] = useState<TestState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const result = await apiFetch<{ storages: SafeStorage[] }>("/api/admin/storages");
        setStorages(result.storages);
        setError(null);
      } catch (caught) {
        setError(errorMessage(caught, "Gagal memuat daftar storage"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const pool = useMemo(() => {
    const totalCapacity = storages.reduce((sum, storage) => sum + storage.limitBytes, 0);
    const totalUsed = storages.reduce((sum, storage) => sum + storage.usedBytes, 0);
    const active = storages.filter((storage) => storage.status === "active");
    const largest = [...active].sort((a, b) => b.freeBytes - a.freeBytes)[0] ?? null;
    return {
      totalCapacity,
      totalUsed,
      totalFree: Math.max(0, totalCapacity - totalUsed),
      activeCount: active.length,
      degradedCount: storages.length - active.length,
      largest,
    };
  }, [storages]);

  function upsert(storage: SafeStorage) {
    setStorages((current) => {
      const index = current.findIndex((item) => item.id === storage.id);
      if (index === -1) return [...current, storage];
      const next = [...current];
      next[index] = storage;
      return next;
    });
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(storage: SafeStorage) {
    setEditing(storage);
    setFormOpen(true);
  }

  async function runTest(storage: SafeStorage) {
    setTestState({ storage, test: null, running: true });
    try {
      const result = await apiFetch<{ test: ConnectionTest }>(`/api/admin/storages/${storage.id}/test`, { method: "POST", body: {} });
      setTestState({ storage, test: result.test, running: false });
      if (result.test.ok) {
        toast({ tone: "success", title: `${storage.name} terhubung`, description: "Keempat langkah tes koneksi berhasil dilewati." });
      } else {
        toast({ tone: "danger", title: `Tes ${storage.name} gagal`, description: result.test.error?.message ?? "Periksa detail langkah di bawah." });
      }
      await load("refresh");
    } catch (caught) {
      setTestState(null);
      toast({ tone: "danger", title: "Tes koneksi gagal dijalankan", description: errorMessage(caught) });
    }
  }

  async function syncUsage(storage: SafeStorage) {
    setBusyId(storage.id);
    try {
      const result = await apiFetch<{ sync: { usedBytes: number; objects: number; truncated?: boolean } }>(
        `/api/admin/storages/${storage.id}/sync`,
        { method: "POST", body: {} },
      );
      toast({
        tone: "success",
        title: "Pemakaian disinkronkan",
        description: `${storage.name}: ${formatBytes(result.sync.usedBytes)} dalam ${formatNumber(result.sync.objects)} objek.`,
      });
      await load("refresh");
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal menyinkronkan pemakaian", description: errorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(storage: SafeStorage) {
    setBusyId(storage.id);
    const nextStatus = storage.status === "active" ? "disabled" : "active";
    try {
      const result = await apiFetch<{ storage: SafeStorage }>(`/api/admin/storages/${storage.id}`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      upsert(result.storage);
      toast({
        tone: nextStatus === "active" ? "success" : "info",
        title: nextStatus === "active" ? "Storage diaktifkan" : "Storage dinonaktifkan",
        description: `${storage.name} ${nextStatus === "active" ? "kembali menerima file baru." : "tidak akan dipilih untuk upload baru."}`,
      });
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal mengubah status", description: errorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteState) return;
    const { storage, force } = deleteState;
    setDeleteState({ ...deleteState, running: true, conflictFiles: 0 });
    try {
      await apiFetch<{ deleted: boolean; orphanedFiles: number }>(`/api/admin/storages/${storage.id}`, {
        method: "DELETE",
        query: force ? { force: "true" } : undefined,
      });
      setStorages((current) => current.filter((item) => item.id !== storage.id));
      setDeleteState(null);
      toast({ tone: "success", title: "Storage dihapus", description: `${storage.name} dikeluarkan dari pool.` });
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === "storage_in_use") {
        const files = (caught.details as { files?: number } | undefined)?.files ?? 0;
        setDeleteState({ storage, running: false, conflictFiles: files, force: false });
        return;
      }
      setDeleteState({ ...deleteState, running: false });
      toast({ tone: "danger", title: "Gagal menghapus storage", description: errorMessage(caught) });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white sm:text-xl">Storage pool Cloudflare R2</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-400">
            Gabungkan beberapa akun R2 menjadi satu pool. Saat ada file masuk, sistem otomatis memilih storage dengan kapasitas cukup dan
            ruang bebas terbesar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load("refresh")} loading={refreshing}>
            <RefreshCw className="size-4" />
            Muat ulang
          </Button>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            Tambah storage
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title="Gagal memuat storage">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Kapasitas pool</p>
          <p className="mt-1 text-xl font-semibold text-white tabular-nums">{formatBytes(pool.totalCapacity)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{formatNumber(storages.length)} storage terdaftar</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Terpakai</p>
          <p className="mt-1 text-xl font-semibold text-white tabular-nums">{formatBytes(pool.totalUsed)}</p>
          <UsageBar used={pool.totalUsed} limit={pool.totalCapacity} showLabels={false} compact className="mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Ruang bebas</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300 tabular-nums">{formatBytes(pool.totalFree)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{pool.activeCount} storage aktif</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Tujuan upload berikutnya</p>
          <p className="mt-1 truncate text-xl font-semibold text-white">{pool.largest?.name ?? "—"}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {pool.largest ? `${formatBytes(pool.largest.freeBytes)} ruang bebas` : "Tambahkan storage aktif terlebih dulu"}
          </p>
        </Card>
      </div>

      {storages.length === 0 ? (
        <Card>
          <CardBody className="py-10">
            <EmptyState
              icon={<ServerCog className="size-7" />}
              title="Belum ada storage R2 yang terhubung"
              description={
                <>
                  Tambahkan bucket Cloudflare R2 pertama Anda. Semua data diambil dari dashboard Cloudflare — tidak ada terminal yang
                  diperlukan. Lihat panduan{" "}
                  <Link href="/docs/r2-setup" className="font-medium text-brand-300 underline underline-offset-2">
                    Cara membuat bucket R2
                  </Link>
                  .
                </>
              }
              action={
                <Button variant="primary" size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  Tambah storage pertama
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {storages.map((storage) => {
            const status = STATUS_META[storage.status];
            const busy = busyId === storage.id;
            return (
              <Card key={storage.id} className="flex flex-col">
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{storage.name}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {pool.largest?.id === storage.id ? <Badge tone="brand">Target upload</Badge> : null}
                    </span>
                  }
                  description={
                    <span className="truncate">
                      bucket <span className="text-slate-300">{storage.bucket}</span> · prioritas {storage.priority}
                    </span>
                  }
                  icon={<Cloud className="size-4 text-brand-300" />}
                  action={
                    storage.lastCheckedAt ? (
                      <span className="hidden text-[11px] text-slate-500 sm:block">Diperiksa {formatRelativeTime(storage.lastCheckedAt)}</span>
                    ) : null
                  }
                />
                <CardBody className="flex-1 space-y-4">
                  <UsageBar used={storage.usedBytes} limit={storage.limitBytes} />

                  <dl className="grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
                    {[
                      { label: "Account ID", value: storage.accountId },
                      { label: "Access Key", value: storage.hasCredentials ? storage.accessKeyIdMasked : "Belum diisi" },
                      { label: "Endpoint", value: storage.endpoint ?? `${storage.accountId}.r2.cloudflarestorage.com` },
                      { label: "Region", value: storage.region || "auto" },
                      { label: "Ruang bebas", value: formatBytes(storage.freeBytes) },
                      { label: "Batas", value: formatBytes(storage.limitBytes) },
                    ].map((row) => (
                      <div key={row.label} className="min-w-0">
                        <dt className="text-[10px] tracking-wide text-slate-500 uppercase">{row.label}</dt>
                        <dd className="truncate font-medium text-slate-300" title={row.value}>
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {storage.notes ? (
                    <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-slate-400">
                      <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                      {storage.notes}
                    </p>
                  ) : null}

                  {storage.lastError ? (
                    <Alert tone="warning" title="Masalah terakhir">
                      <span className="text-[12px]">{storage.lastError}</span>
                    </Alert>
                  ) : null}

                  <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                    <Button size="xs" variant="secondary" onClick={() => void runTest(storage)} disabled={busy}>
                      <Plug className="size-3.5" />
                      Tes koneksi
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => void syncUsage(storage)} loading={busy} disabled={busy}>
                      <Activity className="size-3.5" />
                      Sinkronkan
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => openEdit(storage)} disabled={busy}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => void toggleStatus(storage)} disabled={busy}>
                      {storage.status === "active" ? <Ban className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                      {storage.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      className="ml-auto"
                      disabled={busy}
                      onClick={() => setDeleteState({ storage, running: false, conflictFiles: 0, force: false })}
                    >
                      <Trash2 className="size-3.5" />
                      Hapus
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Alert tone="info" title="Bagaimana storage dipilih otomatis?">
        <p className="text-[13px] leading-relaxed">
          Setiap upload membaca ukuran file, lalu memeriksa seluruh storage aktif. Kandidat yang kapasitasnya tidak cukup, sedang
          nonaktif, atau sudah melewati batas akan dilewati. Dari sisanya, sistem memilih storage dengan ruang bebas terbesar (prioritas
          lebih kecil didahulukan bila ruang bebasnya setara). Anda tetap bisa memaksa storage tertentu dari halaman Upload.
        </p>
      </Alert>

      <StorageFormModal
        open={formOpen}
        storage={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(storage) => {
          upsert(storage);
          toast({ tone: "success", title: editing ? "Storage diperbarui" : "Storage ditambahkan", description: `${storage.name} siap digunakan.` });
        }}
      />

      <Modal
        open={testState !== null}
        onClose={() => setTestState(null)}
        size="lg"
        title="Hasil tes koneksi"
        description={testState ? `${testState.storage.name} · bucket ${testState.storage.bucket}` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {testState ? (
              <Button variant="outline" size="sm" onClick={() => void runTest(testState.storage)} loading={testState.running}>
                <RefreshCw className="size-4" />
                Ulangi tes
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setTestState(null)}>
              Tutup
            </Button>
          </div>
        }
      >
        {testState ? (
          testState.test ? (
            <ConnectionTestPanel test={testState.test} />
          ) : (
            <ConnectionTestPanel test={null} running={testState.running} />
          )
        ) : null}
      </Modal>

      <Modal
        open={deleteState !== null}
        onClose={() => (deleteState?.running ? undefined : setDeleteState(null))}
        size="sm"
        title="Hapus storage dari pool?"
        description={deleteState ? `${deleteState.storage.name} · ${deleteState.storage.bucket}` : undefined}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteState(null)} disabled={deleteState?.running}>
              Batal
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} loading={Boolean(deleteState?.running)}>
              <Trash2 className="size-4" />
              {deleteState?.conflictFiles ? "Tetap hapus (paksa)" : "Hapus storage"}
            </Button>
          </div>
        }
      >
        {deleteState ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-slate-300">
              Menghapus storage hanya mencabut catatan dan kredensial terenkripsi dari aplikasi ini.{" "}
              <span className="font-medium text-white">Objek di bucket R2 tidak dihapus.</span>
            </p>

            {deleteState.conflictFiles > 0 ? (
              <Alert tone="warning" title={`${formatNumber(deleteState.conflictFiles)} file masih tercatat di storage ini`}>
                <p className="text-[13px] leading-relaxed">
                  Metadata file tetap ada di database tetapi tidak bisa diunduh lagi karena bucket-nya tidak terdaftar. Sebaiknya pindahkan
                  file-file itu lewat File Manager terlebih dahulu, atau aktifkan opsi paksa di bawah.
                </p>
                <div className="mt-3">
                  <Switch
                    checked={deleteState.force}
                    onChange={(value) => setDeleteState({ ...deleteState, force: value })}
                    label="Paksa hapus storage ini"
                    description="Metadata file yang tersimpan di sini akan menjadi yatim (tidak dapat diunduh)."
                  />
                </div>
              </Alert>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-slate-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
                Tindakan ini tidak dapat dibatalkan. Anda harus menambahkan storage kembali secara manual bila berubah pikiran.
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
