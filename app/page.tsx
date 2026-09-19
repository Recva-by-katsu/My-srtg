import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowRight,
  Database,
  Download,
  Files,
  HardDrive,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getConfig, getConfigReport, resolveBaseUrl } from "@/lib/config/env";
import { getDatabase, toPublicFile } from "@/lib/db";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DownloadCenter } from "@/components/public/download-center";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { sanitizeSearchTerm } from "@/lib/security/sanitize";
import { formatBytes, formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomeProps) {
  const params = await searchParams;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  const origin = resolveBaseUrl(host ? `${proto}://${host}` : undefined);

  const config = getConfig();
  const report = getConfigReport();
  const db = await getDatabase();

  const search = sanitizeSearchTerm(typeof params.q === "string" ? params.q : "");

  const [list, stats, storages] = await Promise.all([
    db.listFiles({
      visibility: "public",
      search,
      sort: "createdAt",
      direction: "desc",
      limit: 12,
    }),
    db.getPoolStats(),
    db.listStorages(),
  ]);

  const totalCapacity = storages.reduce((sum, storage) => sum + storage.limitBytes, 0);
  const activeNodes = storages.filter((storage) => storage.status === "active").length;
  const notReady = !report.ready || storages.length === 0;

  const heroStats = [
    { label: "File tersedia", value: formatNumber(stats.publicFiles), icon: Files },
    { label: "Total ukuran", value: formatBytes(stats.totalBytes), icon: HardDrive },
    { label: "Node storage", value: `${activeNodes}`, icon: ServerCog },
    { label: "Total unduhan", value: formatNumber(stats.totalDownloads), icon: Download },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
            <div className="flex flex-col items-center text-center">
              <Badge tone="brand" icon={<Sparkles className="size-3" />} className="mb-5">
                {config.app.name} · Cloudflare R2 Storage Pool
              </Badge>

              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Katsu <span className="gradient-text">Download Center</span>
              </h1>

              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:text-base">
                Satu pintu untuk semua file pribadi Anda. Beberapa akun Cloudflare R2 digabungkan menjadi
                satu storage pool{totalCapacity > 0 ? ` berkapasitas ${formatBytes(totalCapacity)}` : ""} -
                pengunjung cukup mengunduh, tanpa pernah tahu di akun mana file itu disimpan.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#files"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 via-accent-500 to-accent-600 px-6 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(56,189,248,0.9)] transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  Jelajahi file
                  <ArrowRight className="size-4" />
                </a>
                <Link
                  href="/docs"
                  className="glass inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold text-slate-200 transition-all hover:border-white/25 hover:text-white active:scale-[0.98]"
                >
                  <Database className="size-4 text-brand-300" />
                  Cara kerja sistem
                </Link>
              </div>
            </div>

            {/* stats */}
            <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {heroStats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="glass glass-hover rounded-2xl p-4 animate-fade-up"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-center gap-2 text-slate-500">
                      <Icon className="size-4 text-brand-300" />
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{stat.label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">
                      {stat.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {notReady ? (
              <div className="mt-8">
                <Alert
                  tone="warning"
                  title="Sistem belum sepenuhnya dikonfigurasi"
                  action={
                    <Link
                      href="/setup"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-white/10"
                    >
                      Buka Setup Assistant
                      <ArrowRight className="size-3.5" />
                    </Link>
                  }
                >
                  {report.issues
                    .filter((issue) => issue.level === "error")
                    .slice(0, 3)
                    .map((issue) => (
                      <p key={`${issue.key}-${issue.message.slice(0, 12)}`}>
                        <span className="font-mono text-[12px] text-amber-200">{issue.key}</span> — {issue.message}
                      </p>
                    ))}
                  {storages.length === 0 ? (
                    <p className="mt-1">
                      Belum ada storage R2 terdaftar. Tambahkan dari{" "}
                      <Link href="/admin/storage" className="font-medium text-amber-200 underline underline-offset-2">
                        Admin → Storage
                      </Link>
                      .
                    </p>
                  ) : null}
                </Alert>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-emerald-400" />
                Link download terproteksi &amp; mendukung resume (HTTP Range)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="size-3.5 text-brand-400" />
                Multipart upload sampai 5 GB+ per file
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ file listing */}
        <DownloadCenter
          initialFiles={list.items.map(toPublicFile)}
          initialTotal={list.total}
          origin={origin}
        />
      </main>

      <SiteFooter />
    </div>
  );
}
