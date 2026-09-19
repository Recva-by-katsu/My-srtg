"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Switch } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { MoveJobProgress, SafeFile, SafeStorage } from "@/lib/client/types";
import { formatBytes, formatBytesPerSecond } from "@/lib/utils/format";

const CHUNK_OPTIONS = [8, 16, 32, 64];

export function FileMoveDialog({
  open,
  file,
  storages,
  onClose,
  onMoved,
}: {
  open: boolean;
  file: SafeFile | null;
  storages: SafeStorage[];
  onClose: () => void;
  onMoved: (file: SafeFile) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [deleteSource, setDeleteSource] = useState(true);
  const [chunkMb, setChunkMb] = useState(32);
  const [job, setJob] = useState<MoveJobProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(0);
  const cancelRef = useRef(false);
  const startedAtRef = useRef(0);

  const targets = useMemo(
    () => storages.filter((storage) => storage.status !== "disabled" && storage.id !== file?.storageId),
    [storages, file?.storageId],
  );

  useEffect(() => {
    if (!open) return;
    setTargetId("");
    setDeleteSource(true);
    setChunkMb(32);
    setJob(null);
    setRunning(false);
    setError(null);
    setSpeed(0);
    cancelRef.current = false;
  }, [open]);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  async function start() {
    if (!file || !targetId) return;
    const target = storages.find((storage) => storage.id === targetId);
    if (target && file.size > target.freeBytes + (deleteSource && target.id === file.storageId ? file.size : 0)) {
      setError(
        `Ruang bebas ${target.name} (${formatBytes(target.freeBytes)}) lebih kecil dari ukuran file (${formatBytes(file.size)}). Pilih storage lain atau kosongkan ruang lebih dulu.`,
      );
      return;
    }

    cancelRef.current = false;
    setRunning(true);
    setError(null);
    setJob(null);
    startedAtRef.current = Date.now();

    const byteBudget = chunkMb * 1024 * 1024;

    try {
      const started = await apiFetch<{ job: MoveJobProgress }>(`/api/admin/files/${file.id}/move`, {
        method: "POST",
        body: { targetStorageId: targetId, deleteSource, byteBudget },
      });
      let current = started.job;
      setJob(current);

      // Advance the job in small chunks so a single worker request never has to
      // stream the whole file (keeps us inside CPU limits on free plans).
      while (!current.completed && current.status === "running" && !cancelRef.current) {
        const step = await apiFetch<{ job: MoveJobProgress }>(`/api/admin/jobs/${current.jobId}`, {
          method: "POST",
          body: { byteBudget },
        });
        current = step.job;
        setJob(current);
        const elapsed = Math.max(0.5, (Date.now() - startedAtRef.current) / 1000);
        setSpeed(current.bytesCopied / elapsed);
      }

      if (cancelRef.current) {
        await apiFetch(`/api/admin/jobs/${current.jobId}`, { method: "DELETE" }).catch(() => undefined);
        setError("Pemindahan dibatalkan. File asli tetap aman di storage semula.");
        return;
      }

      if (current.status === "completed") {
        if (current.file) onMoved(current.file);
        return;
      }

      setError(current.error ?? "Pemindahan berhenti sebelum selesai.");
    } catch (caught) {
      setError(errorMessage(caught, "Gagal memindahkan file"));
    } finally {
      setRunning(false);
      setSpeed(0);
    }
  }

  async function cancelJob() {
    cancelRef.current = true;
    if (job?.jobId) {
      await apiFetch(`/api/admin/jobs/${job.jobId}`, { method: "DELETE" }).catch(() => undefined);
    }
    setRunning(false);
  }

  const percent = job?.percent ?? 0;
  const done = job?.status === "completed";

  return (
    <Modal
      open={open}
      onClose={running ? () => undefined : onClose}
      size="md"
      title="Pindahkan file ke storage lain"
      description={file ? `${file.originalName || file.filename} · ${formatBytes(file.size)}` : undefined}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {running ? (
            <Button variant="outline" size="sm" onClick={cancelJob}>
              Batalkan
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Button>
          )}
          {!done ? (
            <Button variant="primary" size="sm" onClick={start} loading={running} disabled={running || !targetId}>
              <ArrowRightLeft className="size-4" />
              Mulai pindahkan
            </Button>
          ) : (
            <Button variant="success" size="sm" onClick={onClose}>
              <CheckCircle2 className="size-4" />
              Selesai
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <Alert tone="info" title="Pemindahan lintas akun dilakukan bertahap">
          <p className="text-[12px] leading-relaxed">
            Cloudflare R2 tidak bisa menyalin objek antar akun, jadi aplikasi membaca bagian demi bagian dari bucket asal lalu
            mengunggahnya ke bucket tujuan. Tautan unduhan publik tidak berubah.
          </p>
        </Alert>

        {targets.length === 0 ? (
          <Alert tone="warning" title="Tidak ada storage tujuan">
            Tambahkan atau aktifkan storage lain lebih dulu agar file ini bisa dipindahkan.
          </Alert>
        ) : (
          <Field label="Storage tujuan" required htmlFor="move-target">
            {(id) => (
              <Select id={id} value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={running}>
                <option value="">Pilih storage…</option>
                {targets.map((storage) => (
                  <option key={storage.id} value={storage.id}>
                    {storage.name} — bebas {formatBytes(storage.freeBytes)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ukuran langkah" hint="Per permintaan ke server" htmlFor="move-chunk">
            {(id) => (
              <Select id={id} value={String(chunkMb)} onChange={(event) => setChunkMb(Number(event.target.value))} disabled={running}>
                {CHUNK_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} MB per langkah
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-1">
            <Switch
              checked={deleteSource}
              onChange={setDeleteSource}
              disabled={running}
              label="Hapus objek di bucket asal"
              description="Matikan bila ingin menyimpan salinan di kedua bucket."
            />
          </div>
        </div>

        {job ? (
          <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-2 text-slate-300">
                {done ? (
                  <CheckCircle2 className="size-4 text-emerald-300" />
                ) : job.status === "failed" ? (
                  <TriangleAlert className="size-4 text-rose-300" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-brand-300" />
                )}
                {done ? "Pemindahan selesai" : job.status === "failed" ? "Pemindahan gagal" : "Memindahkan…"}
              </span>
              <span className="text-slate-400 tabular-nums">
                {formatBytes(job.bytesCopied)} / {formatBytes(job.size)} ({Math.round(percent)}%)
              </span>
            </div>
            <Progress value={percent} size="sm" indeterminate={running && percent === 0} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="tabular-nums">
                Bagian {job.partsDone}/{job.partsTotal}
              </span>
              {speed > 0 ? <span className="text-brand-300 tabular-nums">{formatBytesPerSecond(speed)}</span> : null}
            </div>
            {job.error ? <p className="text-[12px] text-rose-200">{job.error}</p> : null}
          </div>
        ) : null}

        {error ? (
          <Alert tone="danger" title="Pemindahan tidak berhasil">
            {error}
          </Alert>
        ) : null}

        {done ? (
          <Alert tone="success" title="File berhasil dipindahkan">
            Metadata diperbarui dan tautan unduhan tetap sama, jadi tautan yang sudah dibagikan terus bekerja.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
