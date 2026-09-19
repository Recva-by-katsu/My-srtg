"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the digest in the platform logs (Vercel / Cloudflare) for triage.
    console.error("[katsu-r2-manager] render error", error.digest, error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-20 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/25">
        <TriangleAlert className="size-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        Terjadi kesalahan
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate-400">
        {error.message || "Permintaan tidak dapat diselesaikan."}
        {error.digest ? (
          <>
            {" "}
            <span className="font-mono text-[12px] text-slate-500">digest: {error.digest}</span>
          </>
        ) : null}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-600 px-6 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          <RefreshCw className="size-4" />
          Coba lagi
        </button>
        <Link
          href="/"
          className="glass inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold text-slate-200 transition-all hover:text-white"
        >
          <Home className="size-4 text-brand-300" />
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
