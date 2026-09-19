import Link from "next/link";
import { Compass, Home, SearchX } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <div className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 text-brand-300 ring-1 ring-white/10 animate-float">
          <SearchX className="size-7" />
        </div>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.2em] text-brand-300">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate-400">
          Link yang Anda buka mungkin sudah dipindahkan, atau file dengan ID tersebut tidak tersedia di
          download center.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-600 px-6 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            <Home className="size-4" />
            Ke Download Center
          </Link>
          <Link
            href="/docs"
            className="glass inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold text-slate-200 transition-all hover:text-white"
          >
            <Compass className="size-4 text-brand-300" />
            Baca dokumentasi
          </Link>
        </div>
      </main>
    </div>
  );
}
