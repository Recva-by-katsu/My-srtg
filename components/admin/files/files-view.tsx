"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowRightLeft,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Files,
  FolderSearch,
  Link2,
  Loader2,
  Pencil,
  Search,
  Share2,
  Square,
  Trash2,
} from "lucide-react";
import { FileMoveDialog } from "@/components/admin/files/file-move-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTypeIcon } from "@/components/ui/file-icon";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useClipboard } from "@/components/ui/copy-button";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { SafeFile, SafeStorage } from "@/lib/client/types";
import { cn } from "@/lib/utils/cn";
import {
  categorizeFile,
  fileCategoryLabel,
  formatBytes,
  formatDate,
  formatNumber,
  formatRelativeTime,
  type FileCategory,
} from "@/lib/utils/format";

interface AdminFile extends SafeFile {
  bucket: string;
  objectKey: string;
  storageId: string;
}

type SortField = "createdAt" | "filename" | "size" | "downloadCount";

const CATEGORIES = ["video", "audio", "image", "archive", "document", "text", "application", "other"];
const PAGE_SIZES = [10, 25, 50, 100];

/** The API stores `category` as a free string; narrow it for the UI helpers. */
function toCategory(file: { category: string; filename: string; contentType: string }): FileCategory {
  return (CATEGORIES.includes(file.category) ? file.category : categorizeFile(file.filename, file.contentType)) as FileCategory;
}

function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function FilesView() {
  const { toast } = useToast();
  const { copy } = useClipboard();

  const [files, setFiles] = useState<AdminFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [sort, setSort] = useState<SortField>("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const [storages, setStorages] = useState<SafeStorage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [renameTarget, setRenameTarget] = useState<AdminFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTargets, setDeleteTargets] = useState<AdminFile[]>([]);
  const [deleteObject, setDeleteObject] = useState(true);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);

  const [moveTarget, setMoveTarget] = useState<AdminFile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Debounce the search box so typing does not hammer the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: AdminFile[]; total: number; limit: number; offset: number }>("/api/admin/files", {
        query: {
          q: search || undefined,
          storageId: storageFilter || undefined,
          category: categoryFilter || undefined,
          visibility: visibilityFilter || undefined,
          sort,
          direction,
          limit: pageSize,
          page,
        },
      });
      setFiles(result.items);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Gagal memuat daftar file"));
    } finally {
      setLoading(false);
    }
  }, [search, storageFilter, categoryFilter, visibilityFilter, sort, direction, pageSize, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await apiFetch<{ storages: SafeStorage[] }>("/api/admin/storages");
        setStorages(result.storages);
      } catch {
        // The storage filter simply stays empty; the list itself still works.
      }
    })();
  }, []);

  useEffect(() => {
    setSelected((current) => current.filter((id) => files.some((file) => file.id === id)));
  }, [files]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allOnPageSelected = files.length > 0 && files.every((file) => selected.includes(file.id));

  function toggleSelect(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectAll() {
    setSelected((current) => (allOnPageSelected ? current.filter((id) => !files.some((file) => file.id === id)) : [...new Set([...current, ...files.map((file) => file.id)])]));
  }

  async function copyLinks(targets: AdminFile[], label: string) {
    const text = targets.map((file) => absoluteUrl(`/download/${file.downloadId}`)).join("\n");
    const ok = await copy(text);
    toast(
      ok
        ? { tone: "success", title: `${label} disalin`, description: `${formatNumber(targets.length)} tautan unduhan ada di clipboard Anda.` }
        : { tone: "danger", title: "Gagal menyalin", description: "Browser menolak akses clipboard. Salin manual dari halaman file." },
    );
  }

  async function shareFile(file: AdminFile) {
    const url = absoluteUrl(`/download/${file.downloadId}`);
    const navigatorWithShare = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : null;
    if (navigatorWithShare?.share) {
      try {
        await navigatorWithShare.share({ title: file.originalName || file.filename, text: `Unduh ${file.originalName || file.filename}`, url });
        return;
      } catch {
        // The user dismissed the share sheet - fall back to copying.
      }
    }
    await copyLinks([file], "Tautan unduhan");
  }

  async function toggleVisibility(file: AdminFile) {
    setBusyId(file.id);
    const next = file.visibility === "public" ? "private" : "public";
    try {
      const result = await apiFetch<{ file: AdminFile }>(`/api/admin/files/${file.id}`, { method: "PATCH", body: { visibility: next } });
      setFiles((current) => current.map((item) => (item.id === file.id ? result.file : item)));
      toast({
        tone: next === "public" ? "success" : "info",
        title: next === "public" ? "File dijadikan publik" : "File dijadikan privat",
        description:
          next === "public"
            ? `${result.file.originalName || result.file.filename} kini muncul di Download Center.`
            : `${result.file.originalName || result.file.filename} hanya bisa diakses lewat tautan langsung.`,
      });
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal mengubah visibilitas", description: errorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function bulkVisibility(visibility: "public" | "private") {
    const targets = files.filter((file) => selected.includes(file.id));
    if (targets.length === 0) return;
    setBusyId("bulk");
    let ok = 0;
    for (const file of targets) {
      try {
        const result = await apiFetch<{ file: AdminFile }>(`/api/admin/files/${file.id}`, { method: "PATCH", body: { visibility } });
        setFiles((current) => current.map((item) => (item.id === file.id ? result.file : item)));
        ok += 1;
      } catch {
        // Reported in the summary toast below.
      }
    }
    setBusyId(null);
    toast({
      tone: ok === targets.length ? "success" : "warning",
      title: `${formatNumber(ok)} file diubah menjadi ${visibility === "public" ? "publik" : "privat"}`,
      description: ok === targets.length ? undefined : `${targets.length - ok} file gagal diperbarui.`,
    });
  }

  function openRename(file: AdminFile) {
    setRenameTarget(file);
    setRenameValue(file.filename);
  }

  async function submitRename() {
    if (!renameTarget) return;
    setRenameBusy(true);
    try {
      const result = await apiFetch<{ file: AdminFile }>(`/api/admin/files/${renameTarget.id}`, {
        method: "PATCH",
        body: { filename: renameValue.trim() },
      });
      setFiles((current) => current.map((item) => (item.id === renameTarget.id ? result.file : item)));
      toast({ tone: "success", title: "Nama file diperbarui", description: `Sekarang bernama ${result.file.filename}.` });
      setRenameTarget(null);
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal mengganti nama", description: errorMessage(caught) });
    } finally {
      setRenameBusy(false);
    }
  }

  async function submitDelete() {
    if (deleteTargets.length === 0) return;
    setDeleteBusy(true);
    setDeleteProgress(0);
    let deleted = 0;
    let freedBytes = 0;
    const failures: string[] = [];

    for (const [index, file] of deleteTargets.entries()) {
      try {
        const result = await apiFetch<{ deleted: boolean; objectDeleted: boolean; freedBytes: number }>(`/api/admin/files/${file.id}`, {
          method: "DELETE",
          query: deleteObject ? undefined : { keepObject: "true" },
        });
        deleted += 1;
        freedBytes += result.freedBytes;
      } catch (caught) {
        failures.push(`${file.filename}: ${errorMessage(caught)}`);
      }
      setDeleteProgress(Math.round(((index + 1) / deleteTargets.length) * 100));
    }

    setDeleteBusy(false);
    setDeleteTargets([]);
    setSelected([]);
    await load();
    toast({
      tone: failures.length === 0 ? "success" : "warning",
      title: `${formatNumber(deleted)} file dihapus`,
      description: `${formatBytes(freedBytes)} ruang dibebaskan.${failures.length > 0 ? ` ${failures.length} gagal: ${failures[0]}` : ""}`,
    });
  }

  const selectedFiles = useMemo(() => files.filter((file) => selected.includes(file.id)), [files, selected]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white sm:text-xl">File Manager</h2>
          <p className="mt-1 text-[13px] text-slate-400">
            Cari, ganti nama, atur visibilitas, salin tautan, pindahkan antar bucket R2, atau hapus file Anda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/upload">
            <Button variant="primary" size="sm">
              <Files className="size-4" />
              Upload file
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama file, ekstensi, atau ID unduhan…"
              className="pl-10"
              aria-label="Cari file"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="Storage" htmlFor="filter-storage">
              {(id) => (
                <Select id={id} value={storageFilter} onChange={(event) => { setStorageFilter(event.target.value); setPage(1); }}>
                  <option value="">Semua storage</option>
                  {storages.map((storage) => (
                    <option key={storage.id} value={storage.id}>
                      {storage.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Kategori" htmlFor="filter-category">
              {(id) => (
                <Select id={id} value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                  <option value="">Semua kategori</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {fileCategoryLabel(category)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Visibilitas" htmlFor="filter-visibility">
              {(id) => (
                <Select id={id} value={visibilityFilter} onChange={(event) => { setVisibilityFilter(event.target.value); setPage(1); }}>
                  <option value="">Semua</option>
                  <option value="public">Publik</option>
                  <option value="private">Privat</option>
                </Select>
              )}
            </Field>

            <Field label="Urutkan" htmlFor="filter-sort">
              {(id) => (
                <Select id={id} value={sort} onChange={(event) => { setSort(event.target.value as SortField); setPage(1); }}>
                  <option value="createdAt">Tanggal ditambahkan</option>
                  <option value="filename">Nama file</option>
                  <option value="size">Ukuran</option>
                  <option value="downloadCount">Jumlah unduhan</option>
                </Select>
              )}
            </Field>

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-11 flex-1 justify-center"
                onClick={() => setDirection((value) => (value === "asc" ? "desc" : "asc"))}
              >
                <ArrowDownUp className="size-4" />
                {direction === "asc" ? "Menaik" : "Menurun"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-11"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStorageFilter("");
                  setCategoryFilter("");
                  setVisibilityFilter("");
                  setSort("createdAt");
                  setDirection("desc");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error ? (
        <Alert tone="danger" title="Gagal memuat file">
          {error}
        </Alert>
      ) : null}

      {selected.length > 0 ? (
        <div className="animate-fade-up sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-400/25 bg-brand-500/10 p-3 backdrop-blur-xl">
          <span className="flex items-center gap-2 text-[13px] font-medium text-white">
            <CheckSquare className="size-4 text-brand-300" />
            {formatNumber(selected.length)} file dipilih
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => void copyLinks(selectedFiles, "Tautan unduhan")} disabled={busyId === "bulk"}>
              <Link2 className="size-3.5" />
              Salin tautan
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void bulkVisibility("public")} loading={busyId === "bulk"}>
              <Eye className="size-3.5" />
              Jadikan publik
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void bulkVisibility("private")} loading={busyId === "bulk"}>
              <EyeOff className="size-3.5" />
              Jadikan privat
            </Button>
            <Button size="xs" variant="danger" onClick={() => setDeleteTargets(selectedFiles)}>
              <Trash2 className="size-3.5" />
              Hapus
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected([])}>
              Batal
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Daftar file
              <Badge tone="neutral">{formatNumber(total)} total</Badge>
            </span>
          }
          description={`Halaman ${page} dari ${totalPages} · ${files.length} baris ditampilkan`}
          icon={<FolderSearch className="size-4 text-brand-300" />}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
                aria-pressed={allOnPageSelected}
              >
                {allOnPageSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
                Pilih halaman
              </button>
              <Select
                aria-label="Baris per halaman"
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-9 w-24 text-[12px]"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / hal
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <CardBody className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((key) => (
                <Skeleton key={key} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<FolderSearch className="size-6" />}
              title={search || storageFilter || categoryFilter || visibilityFilter ? "Tidak ada file yang cocok" : "Belum ada file"}
              description={
                search || storageFilter || categoryFilter || visibilityFilter
                  ? "Coba ubah kata kunci atau reset filter untuk melihat seluruh isi storage pool."
                  : "File yang berhasil diunggah akan terdaftar di sini lengkap dengan lokasi bucket dan tautan unduhannya."
              }
              action={
                search || storageFilter || categoryFilter || visibilityFilter ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearchInput("");
                      setStorageFilter("");
                      setCategoryFilter("");
                      setVisibilityFilter("");
                    }}
                  >
                    Reset filter
                  </Button>
                ) : (
                  <Link href="/admin/upload">
                    <Button size="sm" variant="primary">
                      Upload file
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <ul className="space-y-2">
              {files.map((file) => {
                const isSelected = selected.includes(file.id);
                const busy = busyId === file.id;
                return (
                  <li
                    key={file.id}
                    className={cn(
                      "rounded-2xl border p-3 transition-all sm:p-3.5",
                      isSelected ? "border-brand-400/30 bg-brand-500/[0.07]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(file.id)}
                        aria-label={isSelected ? `Batalkan pilihan ${file.filename}` : `Pilih ${file.filename}`}
                        aria-pressed={isSelected}
                        className="mt-1 shrink-0 text-slate-500 transition-colors hover:text-brand-300"
                      >
                        {isSelected ? <CheckSquare className="size-5 text-brand-300" /> : <Square className="size-5" />}
                      </button>

                      <FileTypeIcon category={toCategory(file)} size="sm" />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-white" title={file.originalName || file.filename}>
                            {file.originalName || file.filename}
                          </p>
                          <Badge tone={file.visibility === "public" ? "success" : "warning"}>
                            {file.visibility === "public" ? "Publik" : "Privat"}
                          </Badge>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-400 tabular-nums">{formatBytes(file.size)}</span>
                          <span>{fileCategoryLabel(toCategory(file))}</span>
                          <span className="hidden sm:inline">{formatDate(file.createdAt)}</span>
                          <span className="sm:hidden">{formatRelativeTime(file.createdAt)}</span>
                          <span className="flex items-center gap-1">
                            <ExternalLink className="size-3" />
                            {formatNumber(file.downloadCount)} unduhan
                          </span>
                          <span className="truncate font-mono text-[10px] text-slate-600" title={`bucket ${file.bucket} · ${file.objectKey}`}>
                            {file.storageName} / {file.bucket} / {file.objectKey}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <Button size="xs" variant="secondary" onClick={() => void copyLinks([file], "Tautan unduhan")}>
                            <Copy className="size-3.5" />
                            Salin tautan
                          </Button>
                          <Link href={`/file/${file.downloadId}`} target="_blank" rel="noreferrer">
                            <Button size="xs" variant="ghost">
                              <ExternalLink className="size-3.5" />
                              Halaman file
                            </Button>
                          </Link>
                          <Button size="xs" variant="ghost" onClick={() => void shareFile(file)}>
                            <Share2 className="size-3.5" />
                            Bagikan
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => openRename(file)}>
                            <Pencil className="size-3.5" />
                            Ganti nama
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => void toggleVisibility(file)} loading={busy} disabled={busy}>
                            {file.visibility === "public" ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            {file.visibility === "public" ? "Privat" : "Publik"}
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setMoveTarget(file)}>
                            <ArrowRightLeft className="size-3.5" />
                            Pindahkan
                          </Button>
                          <Button size="xs" variant="danger" className="ml-auto" onClick={() => setDeleteTargets([file])}>
                            <Trash2 className="size-3.5" />
                            Hapus
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
                <ChevronLeft className="size-4" />
                Sebelumnya
              </Button>
              <span className="text-[12px] text-slate-500 tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={page >= totalPages || loading}
              >
                Berikutnya
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Modal
        open={renameTarget !== null}
        onClose={() => (renameBusy ? undefined : setRenameTarget(null))}
        size="sm"
        title="Ganti nama file"
        description="Nama yang tampil di Download Center ikut berubah. Objek di bucket R2 tidak dipindahkan."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenameTarget(null)} disabled={renameBusy}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={submitRename} loading={renameBusy} disabled={renameBusy || renameValue.trim().length === 0}>
              Simpan nama
            </Button>
          </div>
        }
      >
        <Field label="Nama file" required hint="Karakter terlarang ( / \ : * ? &quot; &lt; &gt; | ) otomatis diganti strip." htmlFor="rename-input">
          {(id) => (
            <Input
              id={id}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="nama-file-baru.pdf"
              autoFocus
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={deleteTargets.length > 0}
        onClose={() => (deleteBusy ? undefined : setDeleteTargets([]))}
        size="md"
        title={deleteTargets.length === 1 ? "Hapus file ini?" : `Hapus ${formatNumber(deleteTargets.length)} file?`}
        description="Tautan unduhan yang sudah dibagikan akan berhenti bekerja."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTargets([])} disabled={deleteBusy}>
              Batal
            </Button>
            <Button variant="danger" size="sm" onClick={submitDelete} loading={deleteBusy} disabled={deleteBusy}>
              <Trash2 className="size-4" />
              Hapus permanen
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 scrollbar-thin">
            {deleteTargets.slice(0, 25).map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate text-slate-300">{file.originalName || file.filename}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">{formatBytes(file.size)}</span>
              </li>
            ))}
            {deleteTargets.length > 25 ? (
              <li className="pt-1 text-[11px] text-slate-500">…dan {formatNumber(deleteTargets.length - 25)} file lainnya</li>
            ) : null}
          </ul>

          <Switch
            checked={deleteObject}
            onChange={setDeleteObject}
            disabled={deleteBusy}
            label="Hapus juga objek di bucket R2"
            description="Matikan bila Anda hanya ingin menghapus catatan dari database dan menyimpan datanya di R2."
          />

          {deleteBusy ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] text-slate-300">
              <Loader2 className="size-4 animate-spin text-brand-300" />
              Menghapus… {deleteProgress}%
            </div>
          ) : null}

          <Alert tone="warning" title="Tindakan ini tidak dapat dibatalkan">
            Setelah objek dihapus dari R2, data tidak bisa dipulihkan dari aplikasi ini. Pastikan Anda punya salinan bila file masih
            dibutuhkan.
          </Alert>
        </div>
      </Modal>

      <FileMoveDialog
        open={moveTarget !== null}
        file={moveTarget}
        storages={storages}
        onClose={() => setMoveTarget(null)}
        onMoved={(file) => {
          setFiles((current) => current.map((item) => (item.id === file.id ? { ...item, ...file } as AdminFile : item)));
          setMoveTarget(null);
          toast({ tone: "success", title: "File dipindahkan", description: `${file.originalName || file.filename} kini berada di storage baru.` });
          void load();
        }}
      />
    </div>
  );
}
