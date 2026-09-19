"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FolderOpen, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import type { PublicFile } from "@/lib/client/types";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { FileCard } from "@/components/public/file-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { fileCategoryLabel } from "@/lib/utils/format";
import type { FileCategory } from "@/lib/utils/format";

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "", label: "Semua" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Gambar" },
  { id: "archive", label: "Arsip" },
  { id: "document", label: "Dokumen" },
  { id: "application", label: "Aplikasi" },
  { id: "text", label: "Teks" },
  { id: "other", label: "Lainnya" },
];

const SORTS = [
  { id: "createdAt:desc", label: "Terbaru" },
  { id: "createdAt:asc", label: "Terlama" },
  { id: "filename:asc", label: "Nama A-Z" },
  { id: "size:desc", label: "Ukuran terbesar" },
  { id: "downloadCount:desc", label: "Paling populer" },
] as const;

const PAGE_SIZE = 12;

interface ListResponse {
  items: PublicFile[];
  total: number;
  page: number;
  pages: number;
}

export function DownloadCenter({
  initialFiles,
  initialTotal,
  origin,
}: {
  initialFiles: PublicFile[];
  initialTotal: number;
  origin: string;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<string>("createdAt:desc");
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<PublicFile[]>(initialFiles);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRun = useRef(true);

  // Debounce the search box so we do not hammer the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sortField, direction] = sort.split(":") as [string, "asc" | "desc"];
      const data = await apiFetch<ListResponse>("/api/public/files", {
        skipCsrf: true,
        query: {
          q: search || undefined,
          category: category || undefined,
          sort: sortField,
          direction,
          page,
          limit: PAGE_SIZE,
        },
      });
      setFiles(data.items);
      setTotal(data.total);
    } catch (cause) {
      setError(errorMessage(cause, "Gagal memuat daftar file"));
    } finally {
      setLoading(false);
    }
  }, [category, page, search, sort]);

  useEffect(() => {
    if (firstRun.current) {
      // The server already rendered the first page - skip the duplicate request.
      firstRun.current = false;
      if (!search && !category && sort === "createdAt:desc" && page === 1) return;
    }
    void load();
  }, [load, search, category, sort, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCategoryLabel = useMemo(
    () => (category ? fileCategoryLabel(category as FileCategory) : "Semua kategori"),
    [category],
  );
  const hasFilters = Boolean(search || category || sort !== "createdAt:desc");

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6" id="files">
      <div className="glass rounded-3xl p-4 sm:p-6">
        {/* toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari file berdasarkan nama…"
              aria-label="Cari file"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-10 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-brand-400/60 focus:bg-white/[0.06] focus:outline-none"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Hapus pencarian"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:flex-none">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
                aria-label="Urutkan file"
                className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-[#0b1120] pl-9 pr-8 text-[13px] font-medium text-slate-200 transition-colors focus:border-brand-400/60 focus:outline-none lg:w-52"
              >
                {SORTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="secondary"
              size="md"
              onClick={() => void load()}
              className="h-12 shrink-0 rounded-2xl px-4"
              aria-label="Muat ulang daftar"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* category chips */}
        <div className="scrollbar-thin mt-4 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCategory(item.id);
                setPage(1);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all active:scale-95",
                category === item.id
                  ? "border-brand-400/50 bg-brand-500/15 text-brand-200"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* meta row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
          <span>
            Menampilkan <span className="font-semibold text-slate-300">{files.length}</span> dari{" "}
            <span className="font-semibold text-slate-300">{total}</span> file · {activeCategoryLabel}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setCategory("");
                setSort("createdAt:desc");
                setPage(1);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-brand-300 transition-colors hover:bg-white/5 hover:text-brand-200"
            >
              <X className="size-3.5" />
              Reset filter
            </button>
          ) : null}
        </div>

        {/* results */}
        <div className="mt-5">
          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/8 px-6 py-10 text-center">
              <AlertCircle className="size-6 text-rose-300" />
              <p className="text-[13px] text-rose-100">{error}</p>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshCw className="size-3.5" />
                Coba lagi
              </Button>
            </div>
          ) : loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="size-6" />}
              title={hasFilters ? "Tidak ada file yang cocok" : "Download center masih kosong"}
              description={
                hasFilters
                  ? "Coba kata kunci lain atau reset filter untuk melihat semua file."
                  : "Setelah admin menambahkan storage R2 dan mengupload file, semuanya akan muncul di sini secara otomatis."
              }
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchInput("");
                      setCategory("");
                      setSort("createdAt:desc");
                      setPage(1);
                    }}
                  >
                    Reset filter
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file, index) => (
                <div key={file.downloadId} className="animate-fade-up" style={{ animationDelay: `${index * 28}ms` }}>
                  <FileCard file={file} origin={origin} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* pagination */}
        {pages > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Sebelumnya
            </Button>
            <span className="text-[12px] tabular-nums text-slate-400">
              Halaman {page} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
            >
              Berikutnya
            </Button>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-center text-[12px] text-slate-600">
        Semua transfer dilayani melalui satu domain. Lokasi storage asli (akun, bucket, object key) tidak
        pernah dipublikasikan.
      </p>
    </section>
  );
}
