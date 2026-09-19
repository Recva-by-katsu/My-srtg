"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { ConnectionTestPanel } from "@/components/admin/storage/connection-test-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { apiFetch, errorMessage, fieldIssues } from "@/lib/client/api";
import type { ConnectionTest, SafeStorage } from "@/lib/client/types";
import { formatBytes, parseSizeToBytes } from "@/lib/utils/format";

type LimitUnit = "MB" | "GB" | "TB";

interface FormState {
  name: string;
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  limitValue: string;
  limitUnit: LimitUnit;
  priority: string;
  endpoint: string;
  region: string;
  notes: string;
  verifyConnection: boolean;
}

function bytesToUnit(bytes: number): { value: string; unit: LimitUnit } {
  if (bytes <= 0) return { value: "10", unit: "GB" };
  const tb = bytes / 1024 ** 4;
  if (tb >= 1 && Number.isFinite(tb)) return { value: String(Math.round(tb * 100) / 100), unit: "TB" };
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return { value: String(Math.round(gb * 100) / 100), unit: "GB" };
  return { value: String(Math.round(bytes / 1024 ** 2)), unit: "MB" };
}

const EMPTY_FORM: FormState = {
  name: "",
  accountId: "",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  limitValue: "10",
  limitUnit: "GB",
  priority: "100",
  endpoint: "",
  region: "auto",
  notes: "",
  verifyConnection: true,
};

export function StorageFormModal({
  open,
  onClose,
  storage,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  storage?: SafeStorage | null;
  onSaved: (storage: SafeStorage, test: ConnectionTest | null) => void;
}) {
  const editing = Boolean(storage);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [test, setTest] = useState<ConnectionTest | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIssues({});
    setTest(null);
    setShowSecret(false);
    if (storage) {
      const limit = bytesToUnit(storage.limitBytes);
      setForm({
        name: storage.name,
        accountId: storage.accountId,
        bucket: storage.bucket,
        accessKeyId: "",
        secretAccessKey: "",
        limitValue: limit.value,
        limitUnit: limit.unit,
        priority: String(storage.priority),
        endpoint: storage.endpoint ?? "",
        region: storage.region || "auto",
        notes: storage.notes ?? "",
        verifyConnection: true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, storage]);

  const previewBytes = useMemo(() => {
    const value = Number(form.limitValue);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return parseSizeToBytes(value, form.limitUnit);
  }, [form.limitValue, form.limitUnit]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setIssues({});

    const limitValue = Number(form.limitValue);
    const priority = Number(form.priority || "100");

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      accountId: form.accountId.trim(),
      bucket: form.bucket.trim(),
      limitValue,
      limitUnit: form.limitUnit,
      priority,
      endpoint: form.endpoint.trim(),
      region: form.region.trim() || "auto",
      notes: form.notes.trim() || null,
      verifyConnection: form.verifyConnection,
    };

    if (form.accessKeyId.trim()) payload.accessKeyId = form.accessKeyId.trim();
    if (form.secretAccessKey.trim()) payload.secretAccessKey = form.secretAccessKey.trim();
    else if (!editing) payload.secretAccessKey = "";

    try {
      const result = editing
        ? await apiFetch<{ storage: SafeStorage; test: ConnectionTest | null }>(`/api/admin/storages/${storage!.id}`, {
            method: "PATCH",
            body: payload,
          })
        : await apiFetch<{ storage: SafeStorage; test: ConnectionTest | null }>("/api/admin/storages", {
            method: "POST",
            body: { ...payload, accessKeyId: form.accessKeyId.trim(), secretAccessKey: form.secretAccessKey.trim() },
          });

      setTest(result.test);
      onSaved(result.storage, result.test);
      if (result.test && !result.test.ok) {
        setError("Storage tersimpan, tetapi tes koneksi gagal. Perbaiki kredensial lalu simpan ulang.");
      } else {
        onClose();
      }
    } catch (caught) {
      setError(errorMessage(caught, "Gagal menyimpan storage"));
      setIssues(fieldIssues(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit storage · ${storage?.name ?? ""}` : "Tambah storage Cloudflare R2"}
      description={
        editing
          ? "Kosongkan kolom Access Key untuk mempertahankan kredensial yang tersimpan. Semua nilai dienkripsi sebelum disimpan."
          : "Isi detail bucket R2 Anda. Kredensial hanya disimpan di backend dan dienkripsi dengan AES-256-GCM."
      }
    >
      <form id="storage-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {error ? (
          <Alert tone="danger" title="Tidak dapat menyimpan">
            {error}
          </Alert>
        ) : null}

        {test ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Hasil tes koneksi</p>
            <ConnectionTestPanel test={test} />
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama storage" required hint="Label bebas, contoh: R2 Pribadi 1" error={issues.name} htmlFor="storage-name">
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="R2 Pribadi 1"
                autoComplete="off"
                required
              />
            )}
          </Field>

          <Field label="Prioritas" hint="Angka kecil dipilih lebih dulu (default 100)" error={issues.priority} htmlFor="storage-priority">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={9999}
                value={form.priority}
                onChange={(event) => update("priority", event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>

          <Field
            label="Account ID Cloudflare"
            required
            hint="32 karakter heksadesimal dari dashboard Cloudflare"
            error={issues.accountId}
            htmlFor="storage-account"
          >
            {(id) => (
              <Input
                id={id}
                value={form.accountId}
                onChange={(event) => update("accountId", event.target.value)}
                placeholder="e4a1c9..."
                autoComplete="off"
                spellCheck={false}
                required
              />
            )}
          </Field>

          <Field label="Nama bucket" required hint="Harus sudah dibuat di R2" error={issues.bucket} htmlFor="storage-bucket">
            {(id) => (
              <Input
                id={id}
                value={form.bucket}
                onChange={(event) => update("bucket", event.target.value)}
                placeholder="katsu-media"
                autoComplete="off"
                spellCheck={false}
                required
              />
            )}
          </Field>

          <Field
            label="Access Key ID"
            required={!editing}
            hint={editing ? `Tersimpan: ${storage?.accessKeyIdMasked ?? "-"} — isi hanya untuk mengganti` : "Dari API Token R2 (S3 client)"}
            error={issues.accessKeyId}
            htmlFor="storage-access-key"
          >
            {(id) => (
              <Input
                id={id}
                value={form.accessKeyId}
                onChange={(event) => update("accessKeyId", event.target.value)}
                placeholder={editing ? "Biarkan kosong untuk mempertahankan" : ""}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <Field
            label="Secret Access Key"
            required={!editing}
            hint={editing ? "Kosongkan untuk mempertahankan secret yang tersimpan" : "Hanya dikirim sekali lewat HTTPS lalu dienkripsi"}
            error={issues.secretAccessKey}
            htmlFor="storage-secret"
          >
            {(id) => (
              <div className="relative">
                <Input
                  id={id}
                  type={showSecret ? "text" : "password"}
                  value={form.secretAccessKey}
                  onChange={(event) => update("secretAccessKey", event.target.value)}
                  placeholder={editing ? "Biarkan kosong untuk mempertahankan" : ""}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((value) => !value)}
                  aria-label={showSecret ? "Sembunyikan secret" : "Tampilkan secret"}
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            )}
          </Field>

          <Field label="Storage limit" required hint={`Setara ${formatBytes(previewBytes)}`} error={issues.limitValue} htmlFor="storage-limit">
            {(id) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  type="number"
                  min={1}
                  step="any"
                  value={form.limitValue}
                  onChange={(event) => update("limitValue", event.target.value)}
                  className="flex-1"
                  required
                />
                <Select
                  aria-label="Satuan storage limit"
                  value={form.limitUnit}
                  onChange={(event) => update("limitUnit", event.target.value as LimitUnit)}
                  className="w-24"
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </Select>
              </div>
            )}
          </Field>

          <Field label="Region" hint="Default `auto` sudah benar untuk R2" error={issues.region} htmlFor="storage-region">
            {(id) => (
              <Input id={id} value={form.region} onChange={(event) => update("region", event.target.value)} placeholder="auto" autoComplete="off" />
            )}
          </Field>

          <Field
            label="Endpoint (opsional)"
            hint="Kosongkan untuk memakai https://<Account ID>.r2.cloudflarestorage.com"
            error={issues.endpoint}
            htmlFor="storage-endpoint"
            className="sm:col-span-2"
          >
            {(id) => (
              <Input
                id={id}
                value={form.endpoint}
                onChange={(event) => update("endpoint", event.target.value)}
                placeholder="https://<account-id>.r2.cloudflarestorage.com"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <Field label="Catatan (opsional)" hint="Membantu mengingat isi bucket ini" error={issues.notes} htmlFor="storage-notes" className="sm:col-span-2">
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Bucket khusus arsip video keluarga"
              />
            )}
          </Field>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Switch
            checked={form.verifyConnection}
            onChange={(value) => update("verifyConnection", value)}
            label="Jalankan tes koneksi setelah menyimpan"
            description="Empat langkah: akses bucket, baca daftar objek, tulis file uji, lalu hapus."
          />
          <div className="flex items-start gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
            <p>
              Secret Access Key dienkripsi dengan AES-256-GCM memakai <code className="rounded bg-white/[0.06] px-1">CREDENTIAL_ENCRYPTION_KEY</code>{" "}
              sebelum disimpan, dan tidak pernah dikirim kembali ke browser.
            </p>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-slate-500">
            <KeyRound className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
            <p>Kredensial hanya dipakai backend saat menandatangani permintaan S3 ke R2.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={submitting}>
            <Check className="size-4" />
            {editing ? "Simpan perubahan" : "Simpan storage"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
