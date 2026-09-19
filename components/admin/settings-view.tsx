"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Database,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { ConfigIssue, ConfigReport, OverviewResponse } from "@/lib/client/types";
import { useSession } from "@/lib/hooks/use-session";
import { formatDate, formatNumber } from "@/lib/utils/format";

interface DatabaseResponse {
  info: { driver: string; ready: boolean; schemaInitialized: boolean; message?: string };
  schemaVersion: string;
  counts: { files: number; storages: number; uploadSessions: number };
}

const ISSUE_TONE: Record<ConfigIssue["level"], "danger" | "warning" | "neutral"> = {
  error: "danger",
  warn: "warning",
  info: "neutral",
};

const DOC_LINKS = [
  { href: "/docs/environment-variables", label: "Referensi environment variables", icon: KeyRound },
  { href: "/docs/database-setup", label: "Menyiapkan D1 atau KV", icon: Database },
  { href: "/docs/security", label: "Panduan keamanan", icon: ShieldCheck },
  { href: "/docs/troubleshooting", label: "Pemecahan masalah", icon: Wrench },
  { href: "/docs/deployment", label: "Deploy ke Cloudflare atau Vercel", icon: ArrowUpRight },
];

export function SettingsView() {
  const { toast } = useToast();
  const { session } = useSession();
  const [database, setDatabase] = useState<DatabaseResponse | null>(null);
  const [config, setConfig] = useState<ConfigReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [db, overview] = await Promise.all([
        apiFetch<DatabaseResponse>("/api/admin/database"),
        apiFetch<OverviewResponse>("/api/admin/overview"),
      ]);
      setDatabase(db);
      setConfig(overview.config);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Gagal memuat pengaturan"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function installSchema(force: boolean) {
    setInstalling(true);
    setForceOpen(false);
    try {
      const result = await apiFetch<DatabaseResponse["info"] & { schemaVersion: string }>("/api/admin/database", {
        method: "POST",
        query: force ? { force: "true" } : undefined,
        body: {},
      });
      toast({
        tone: "success",
        title: force ? "Skema dipasang ulang" : "Skema database dipasang",
        description: `Driver ${String(result.driver).toUpperCase()} · versi skema ${String(result.schemaVersion)}.`,
      });
      await load("refresh");
    } catch (caught) {
      toast({ tone: "danger", title: "Gagal memasang skema", description: errorMessage(caught) });
    } finally {
      setInstalling(false);
    }
  }

  if (loading && !database) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const info = database?.info;
  const issues = config?.issues ?? [];
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warn");
  const infos = issues.filter((issue) => issue.level === "info");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white sm:text-xl">Pengaturan &amp; diagnostik</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-400">
            Periksa kesiapan database, environment variables, dan keamanan aplikasi. Semua nilai sensitif tetap berada di server — halaman
            ini hanya menampilkan statusnya.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load("refresh")} loading={refreshing}>
            <RefreshCw className="size-4" />
            Periksa ulang
          </Button>
          <Link href="/setup">
            <Button variant="primary" size="sm">
              <Wrench className="size-4" />
              Setup Assistant
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title="Gagal memuat pengaturan">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Database"
            description="Cloudflare D1, KV, atau memori (otomatis dipilih lewat DATABASE_DRIVER)"
            icon={<Database className="size-4 text-brand-300" />}
            action={info?.ready ? <Badge tone="success">Siap</Badge> : <Badge tone="danger">Belum siap</Badge>}
          />
          <CardBody className="space-y-4">
            <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
              {[
                { label: "Driver aktif", value: (info?.driver ?? "-").toUpperCase() },
                { label: "Versi skema", value: database?.schemaVersion ?? "-" },
                { label: "Skema terpasang", value: info?.schemaInitialized ? "Ya" : "Belum" },
                { label: "Koneksi", value: info?.ready ? "Berhasil" : "Gagal" },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <dt className="text-[10px] tracking-wide text-slate-500 uppercase">{row.label}</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>

            {info?.message ? (
              <Alert tone={info.ready ? "info" : "danger"} title="Pesan driver">
                <span className="text-[12px]">{info.message}</span>
              </Alert>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "File", value: database?.counts.files ?? 0 },
                { label: "Storage", value: database?.counts.storages ?? 0 },
                { label: "Sesi upload", value: database?.counts.uploadSessions ?? 0 },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-lg font-semibold text-white tabular-nums">{formatNumber(row.value)}</p>
                  <p className="text-[10px] tracking-wide text-slate-500 uppercase">{row.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              <Button size="sm" variant="primary" onClick={() => void installSchema(false)} loading={installing} disabled={installing}>
                <CheckCircle2 className="size-4" />
                {info?.schemaInitialized ? "Perbarui skema" : "Pasang skema"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setForceOpen(true)} disabled={installing}>
                <TriangleAlert className="size-4" />
                Pasang ulang (paksa)
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Tombol di atas menjalankan skrip SQL yang sama dengan berkas <code className="rounded bg-white/[0.06] px-1">database/schema.sql</code>{" "}
              — jadi Anda tidak perlu terminal atau alat migrasi apa pun.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Environment & konfigurasi"
            description="Dibaca dari environment variables di dashboard hosting Anda"
            icon={<Activity className="size-4 text-accent-300" />}
            action={config?.ready ? <Badge tone="success">Lengkap</Badge> : <Badge tone="warning">Perlu perhatian</Badge>}
          />
          <CardBody className="space-y-3">
            <dl className="space-y-2 text-[12px]">
              {[
                { label: "Mode unduhan", value: config?.downloadMode ?? "-" },
                { label: "Kredensial R2", value: config?.credentialsEncrypted ? "Terenkripsi AES-256-GCM" : "Belum terenkripsi" },
                { label: "Akun admin", value: config?.adminConfigured ? "Terkonfigurasi" : "Belum dikonfigurasi" },
                { label: "Mode demo", value: config?.demoMode ? "Aktif (data contoh, R2 tidak dihubungi)" : "Nonaktif" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="truncate text-right font-medium text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>

            {issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[12px] text-emerald-200">
                <CheckCircle2 className="size-4 shrink-0" />
                Semua variabel penting terisi. Sistem siap dipakai.
              </div>
            ) : (
              <ul className="space-y-2">
                {issues.map((issue) => (
                  <li key={`${issue.level}-${issue.key}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ISSUE_TONE[issue.level]}>{issue.level === "error" ? "Wajib" : issue.level === "warn" ? "Saran" : "Info"}</Badge>
                      <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-brand-200">{issue.key}</code>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{issue.message}</p>
                  </li>
                ))}
              </ul>
            )}

            {errors.length > 0 ? (
              <Alert tone="danger" title={`${errors.length} variabel wajib belum terisi`}>
                Buka Setup Assistant untuk membuat nilainya, lalu tempel di dashboard hosting (Cloudflare Workers &amp; Pages → Settings →
                Variables, atau Vercel → Project → Settings → Environment Variables).
              </Alert>
            ) : null}
            {warnings.length > 0 || infos.length > 0 ? (
              <p className="text-[11px] text-slate-500">
                {warnings.length} saran dan {infos.length} catatan informasi ditampilkan di atas.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Keamanan & sesi" icon={<ShieldCheck className="size-4 text-emerald-300" />} />
          <CardBody className="space-y-3">
            <dl className="space-y-2 text-[12px]">
              {[
                { label: "Login sebagai", value: session?.username ?? "-" },
                { label: "Sesi berakhir", value: session?.expiresAt ? formatDate(session.expiresAt) : "-" },
                { label: "Cookie sesi", value: "HttpOnly · SameSite=Strict" },
                { label: "Proteksi CSRF", value: "Double-submit token (x-katsu-csrf)" },
                { label: "Password", value: "PBKDF2-SHA256, tidak pernah disimpan polos" },
                { label: "Kredensial R2", value: "Hanya dipakai backend, tidak pernah dikirim ke browser" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="truncate text-right font-medium text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>

            <Alert tone="info" title="Mengganti password admin">
              <p className="text-[12px] leading-relaxed">
                Buat hash baru lewat Setup Assistant (password tidak pernah dikirim ke server), lalu ganti nilai{" "}
                <code className="rounded bg-white/[0.06] px-1">ADMIN_PASSWORD_HASH</code> di dashboard hosting dan deploy ulang. Ganti juga{" "}
                <code className="rounded bg-white/[0.06] px-1">SESSION_SECRET</code> bila ingin mengakhiri semua sesi yang sedang aktif.
              </p>
              <div className="mt-3">
                <Link href="/setup#password">
                  <Button size="xs" variant="secondary">
                    <KeyRound className="size-3.5" />
                    Buat hash password baru
                  </Button>
                </Link>
              </div>
            </Alert>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Panduan terkait" icon={<BookOpen className="size-4 text-brand-300" />} />
          <CardBody>
            <ul className="space-y-1">
              {DOC_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                    >
                      <Icon className="size-4 shrink-0 text-brand-300" />
                      <span className="flex-1 truncate">{link.label}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-slate-600" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">
              Butuh bantuan langkah demi langkah? Dokumentasi lengkap tersedia di{" "}
              <Link href="/docs" className="font-medium text-brand-300 underline underline-offset-2">
                /docs
              </Link>
              .
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal
        open={forceOpen}
        onClose={() => setForceOpen(false)}
        size="sm"
        title="Pasang ulang skema database?"
        description="Skema akan dibuat ulang dari awal pada driver yang aktif."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForceOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" size="sm" onClick={() => void installSchema(true)} loading={installing}>
              Ya, pasang ulang
            </Button>
          </div>
        }
      >
        <Alert tone="warning" title="Data yang ada tidak dijamin tetap utuh">
          <p className="text-[12px] leading-relaxed">
            Pada D1, tabel yang sudah ada akan di-drop lalu dibuat ulang, sehingga seluruh catatan file, storage, dan sesi upload hilang.
            Objek di bucket R2 tidak terpengaruh, tetapi metadata-nya perlu didaftarkan ulang. Gunakan hanya bila skema rusak atau Anda
            memang ingin memulai dari nol.
          </p>
        </Alert>
      </Modal>
    </div>
  );
}
