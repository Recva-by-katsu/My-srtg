"use client";

import { Gauge, Info, Layers, ServerCog, SlidersHorizontal, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { SafeStorage } from "@/lib/client/types";
import type { UploadManagerSettings } from "@/lib/upload/uploader";

export interface UploadDefaults {
  visibility: "public" | "private";
  preferredStorageId: string | null;
}

const PART_SIZE_OPTIONS = [5, 8, 16, 32, 64, 128];

export function UploadSettingsModal({
  open,
  onClose,
  settings,
  onSettingsChange,
  defaults,
  onDefaultsChange,
  storages,
}: {
  open: boolean;
  onClose: () => void;
  settings: UploadManagerSettings;
  onSettingsChange: (patch: Partial<UploadManagerSettings>) => void;
  defaults: UploadDefaults;
  onDefaultsChange: (patch: Partial<UploadDefaults>) => void;
  storages: SafeStorage[];
}) {
  const activeStorages = storages.filter((storage) => storage.status === "active");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Pengaturan upload"
      description="Nilai ini disimpan di perangkat Anda dan langsung dipakai untuk file berikutnya."
      footer={
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Selesai
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Ukuran bagian (part)"
            hint={`${settings.partSizeMb} MB per permintaan ke R2`}
            htmlFor="setting-part-size"
          >
            {(id) => (
              <Select
                id={id}
                value={String(settings.partSizeMb)}
                onChange={(event) => onSettingsChange({ partSizeMb: Number(event.target.value) })}
              >
                {PART_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} MB
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="File bersamaan" hint="Berapa file diunggah paralel (1–4)" htmlFor="setting-file-concurrency">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={4}
                value={settings.fileConcurrency}
                onChange={(event) => onSettingsChange({ fileConcurrency: Math.min(4, Math.max(1, Number(event.target.value) || 1)) })}
              />
            )}
          </Field>

          <Field label="Bagian bersamaan" hint="Koneksi paralel per file (1–8)" htmlFor="setting-part-concurrency">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={8}
                value={settings.partConcurrency}
                onChange={(event) => onSettingsChange({ partConcurrency: Math.min(8, Math.max(1, Number(event.target.value) || 1)) })}
              />
            )}
          </Field>

          <Field label="Visibilitas default" hint="Menentukan siapa yang bisa mengunduh" htmlFor="setting-visibility">
            {(id) => (
              <Select
                id={id}
                value={defaults.visibility}
                onChange={(event) => onDefaultsChange({ visibility: event.target.value as UploadDefaults["visibility"] })}
              >
                <option value="public">Publik — muncul di Download Center</option>
                <option value="private">Privat — hanya lewat tautan admin</option>
              </Select>
            )}
          </Field>

          <Field
            label="Storage tujuan"
            hint="Auto = dipilih sistem berdasarkan ruang bebas"
            htmlFor="setting-storage"
            className="sm:col-span-2"
          >
            {(id) => (
              <Select
                id={id}
                value={defaults.preferredStorageId ?? ""}
                onChange={(event) => onDefaultsChange({ preferredStorageId: event.target.value || null })}
              >
                <option value="">Auto (ruang bebas terbesar)</option>
                {activeStorages.map((storage) => (
                  <option key={storage.id} value={storage.id}>
                    {storage.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Switch
          checked={settings.autoStart}
          onChange={(value) => onSettingsChange({ autoStart: value })}
          label="Mulai upload otomatis"
          description="Matikan bila Anda ingin memeriksa antrean dulu sebelum mengirim."
        />

        <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] text-slate-400">
          <p className="flex items-start gap-2">
            <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
            <span>
              Bagian lebih besar = lebih sedikit permintaan (hemat operasi Class A R2), tetapi setiap percobaan ulang mengirim ulang data
              lebih banyak. 8–32 MB biasanya paling seimbang.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Split className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
            <span>
              Naikkan paralelisme untuk koneksi cepat dan file sangat besar; turunkan ke 1 bila jaringan seluler sering putus.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Layers className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
            <span>
              Maksimum 10.000 bagian per file. File 5 TB butuh bagian ≥ 512 MB, file 100 GB cukup 8–16 MB.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ServerCog className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
            <span>
              {activeStorages.length > 0
                ? `${activeStorages.length} storage aktif tersedia sebagai tujuan upload.`
                : "Belum ada storage aktif — tambahkan lebih dulu di halaman Storage R2."}
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
            <span>Perubahan hanya memengaruhi file yang belum mulai; sesi multipart yang sudah terbuka memakai ukuran bagian awalnya.</span>
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-slate-500">
          <Gauge className="size-4 shrink-0 text-accent-300" />
          Batas ukuran file per upload ditentukan oleh environment variable <code className="rounded bg-white/[0.06] px-1">MAX_UPLOAD_SIZE_GB</code>.
        </div>
      </div>
    </Modal>
  );
}
