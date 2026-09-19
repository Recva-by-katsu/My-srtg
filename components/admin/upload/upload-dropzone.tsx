"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, FolderUp, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";

type FileWithRelativePath = File & { webkitRelativePath?: string };

/**
 * Flattens `folder/sub/file.jpg` into `folder-sub-file.jpg` because the server
 * sanitizer replaces path separators, so the queue shows the final name.
 */
function withFlatName(file: File): File {
  const relative = (file as FileWithRelativePath).webkitRelativePath;
  if (!relative || relative === file.name) return file;
  const flat = relative.replace(/[/\\]+/g, "-");
  try {
    return new File([file], flat, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function collectFiles(list: FileList | null, options: { flatten: boolean }): File[] {
  if (!list) return [];
  const files = Array.from(list).filter((file) => file.size > 0);
  return options.flatten ? files.map(withFlatName) : files;
}

export function UploadDropzone({
  onFiles,
  maxFileSizeBytes,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  maxFileSizeBytes?: number;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // `webkitdirectory` is not part of the React type definitions yet.
  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.setAttribute("multiple", "");
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const dropped = event.dataTransfer?.files;
      const files = collectFiles(dropped ?? null, { flatten: false });
      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative overflow-hidden rounded-3xl border-2 border-dashed p-6 text-center transition-all sm:p-10",
        dragging
          ? "border-brand-400/60 bg-brand-500/[0.08] shadow-[0_0_60px_-15px_rgba(14,165,233,0.5)]"
          : "border-white/[0.10] bg-white/[0.02] hover:border-white/20",
        disabled && "opacity-60",
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(30rem_18rem_at_50%_0%,rgba(14,165,233,0.10),transparent)]" />

      <div className={cn("mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/25 to-accent-500/10 ring-1 ring-brand-400/25 transition-transform", dragging ? "scale-110" : "animate-float")}>
        <UploadCloud className="size-8 text-brand-200" />
      </div>

      <h3 className="mt-5 text-base font-semibold text-white sm:text-lg">
        {dragging ? "Lepaskan untuk menambahkan ke antrean" : "Tarik & lepas file di sini"}
      </h3>
      <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-slate-400">
        Upload langsung ke Cloudflare R2 lewat jalur multipart. File 5 GB+ tetap aman karena data dikirim per bagian — tidak pernah
        ditampung utuh di memori browser.
        {maxFileSizeBytes ? <span className="text-slate-500"> Batas per file: {formatBytes(maxFileSizeBytes)}.</span> : null}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="size-4" />
          Pilih file
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => folderInputRef.current?.click()}>
          <FolderUp className="size-4" />
          Upload folder
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => cameraInputRef.current?.click()}>
          <Camera className="size-4" />
          Ambil foto/video
        </Button>
      </div>

      <p className="mt-4 text-[11px] text-slate-500">
        Antrean tersimpan di perangkat ini, jadi refresh halaman tidak membatalkan upload yang sedang berjalan.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = collectFiles(event.target.files, { flatten: false });
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const files = collectFiles(event.target.files, { flatten: true });
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const files = collectFiles(event.target.files, { flatten: false });
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
