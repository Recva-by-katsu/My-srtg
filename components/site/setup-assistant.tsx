"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  FileTerminal,
  KeyRound,
  RefreshCw,
  Rocket,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton, useClipboard } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { hashPassword, inspectPasswordHash, MIN_RECOMMENDED_ITERATIONS } from "@/lib/auth/password";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/hooks/use-session";
import { randomToken } from "@/lib/utils/crypto";
import { cn } from "@/lib/utils/cn";

interface HealthResponse {
  status: string;
  version: string;
  time: string;
  database: { driver: string; ready: boolean; schemaInitialized: boolean };
  downloadMode: string;
  demoMode: boolean;
  configured: boolean;
  blockingIssues: number;
}

const ITERATION_OPTIONS = [25_000, 50_000, 100_000, 200_000, 310_000];

const STEPS = [
  { id: "status", label: "Status sistem", icon: Activity },
  { id: "password", label: "Password admin", icon: KeyRound },
  { id: "secrets", label: "Secret kunci", icon: ShieldCheck },
  { id: "database", label: "Database", icon: Database },
  { id: "storage", label: "Storage R2", icon: ServerCog },
  { id: "deploy", label: "Deploy & selesai", icon: Rocket },
];

function GeneratedValue({
  label,
  value,
  hint,
  onRegenerate,
  secret = false,
}: {
  label: string;
  value: string;
  hint?: string;
  onRegenerate?: () => void;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const display = revealed || !value ? value : `${value.slice(0, 6)}${"•".repeat(24)}`;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        <div className="flex items-center gap-1.5">
          {secret && value ? (
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {revealed ? "Sembunyikan" : "Lihat"}
            </button>
          ) : null}
          {value ? <CopyButton value={value} label={label} compact /> : null}
          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              aria-label={`Buat ulang ${label}`}
              className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:text-white"
            >
              <RefreshCw className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-brand-200">{display || "—"}</p>
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SetupAssistant() {
  const { toast } = useToast();
  const { copy } = useClipboard();
  const { session } = useSession();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [username, setUsername] = useState("katsu");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [iterations, setIterations] = useState(100_000);
  const [hash, setHash] = useState("");
  const [hashing, setHashing] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);

  const [sessionSecret, setSessionSecret] = useState("");
  const [encryptionKey, setEncryptionKey] = useState("");
  const [downloadSecret, setDownloadSecret] = useState("");

  const [driver, setDriver] = useState<"d1" | "kv">("d1");
  const [databaseId, setDatabaseId] = useState("");
  const [kvNamespaceId, setKvNamespaceId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // Sensible starting values so the operator only has to copy what they need.
    setSessionSecret(randomToken(32));
    setEncryptionKey(randomToken(32));
    setDownloadSecret(randomToken(32));
    if (typeof window !== "undefined" && !appUrl) setAppUrl(window.location.origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const result = await apiFetch<HealthResponse>("/api/health", { skipCsrf: true });
      setHealth(result);
      setHealthError(null);
      if (result.database?.driver) setDriver(result.database.driver === "kv" ? "kv" : "d1");
    } catch (caught) {
      setHealthError(errorMessage(caught, "Tidak dapat menghubungi /api/health"));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  async function generateHash() {
    setHashError(null);
    if (password.length < 8) {
      setHashError("Password minimal 8 karakter. Gunakan kombinasi huruf, angka, dan simbol.");
      return;
    }
    if (password !== confirm) {
      setHashError("Konfirmasi password tidak sama.");
      return;
    }
    if (iterations < MIN_RECOMMENDED_ITERATIONS) {
      setHashError(`Iterations minimal ${MIN_RECOMMENDED_ITERATIONS} agar hash tidak mudah ditebak.`);
      return;
    }
    setHashing(true);
    try {
      const value = await hashPassword(password, iterations);
      setHash(value);
      toast({
        tone: "success",
        title: "Hash password dibuat",
        description: "Salin nilainya ke variabel ADMIN_PASSWORD_HASH. Proses ini berjalan sepenuhnya di browser Anda.",
      });
    } catch (caught) {
      setHashError(errorMessage(caught, "Gagal membuat hash"));
    } finally {
      setHashing(false);
    }
  }

  const envPreview = useMemo(() => {
    const lines: string[] = [
      "# Katsu R2 Manager - environment variables",
      "# Tempel di dashboard hosting Anda (Cloudflare Workers & Pages -> Settings -> Variables and Secrets,",
      "# atau Vercel -> Project -> Settings -> Environment Variables). Tidak perlu terminal.",
      "",
      "# --- Admin ---",
      `ADMIN_USERNAME=${username || "katsu"}`,
      `ADMIN_PASSWORD_HASH=${hash || "<buat hash di langkah 2>"}`,
      `PASSWORD_PBKDF2_ITERATIONS=${iterations}`,
      `SESSION_SECRET=${sessionSecret || "<buat di langkah 3>"}`,
      `CREDENTIAL_ENCRYPTION_KEY=${encryptionKey || "<buat di langkah 3>"}`,
      "SESSION_TTL_HOURS=12",
      "",
      "# --- Database ---",
      `DATABASE_DRIVER=${driver}`,
      driver === "kv"
        ? `KV_NAMESPACE_ID=${kvNamespaceId || "<id namespace KV>"}`
        : `DATABASE_ID=${databaseId || "<id database D1>"}`,
      "",
      "# --- Cloudflare (opsional, untuk Setup Assistant & diagnostik) ---",
      `CLOUDFLARE_ACCOUNT_ID=${accountId || "<account id 32 karakter>"}`,
      `CLOUDFLARE_API_TOKEN=${apiToken || "<token dengan izin D1:Edit / KV:Edit>"}`,
      "",
      "# --- Aplikasi ---",
      `APP_URL=${appUrl || "https://aplikasi-anda.example.com"}`,
      "APP_NAME=Katsu R2 Manager",
      "",
      "# --- Upload & unduhan ---",
      "DOWNLOAD_MODE=stream",
      `DOWNLOAD_SIGNING_SECRET=${downloadSecret || "<buat di langkah 3>"}`,
      "DOWNLOAD_LINK_TTL_SECONDS=21600",
      "PUBLIC_LISTING=true",
      "DEFAULT_PART_SIZE_MB=8",
      "MAX_UPLOAD_SIZE_GB=20",
      "MAX_CONCURRENT_PARTS=3",
      "",
      "# --- Mode demo (isi true hanya untuk mencoba UI tanpa R2) ---",
      "DEMO_MODE=false",
    ];
    return lines.join("\n");
  }, [username, hash, iterations, sessionSecret, encryptionKey, driver, databaseId, kvNamespaceId, accountId, apiToken, appUrl, downloadSecret]);

  const progress = useMemo(() => {
    const done = [Boolean(hash), Boolean(sessionSecret), Boolean(encryptionKey), driver === "kv" ? Boolean(kvNamespaceId) : Boolean(databaseId), Boolean(health?.configured)].filter(Boolean).length;
    return Math.round((done / 5) * 100);
  }, [hash, sessionSecret, encryptionKey, driver, databaseId, kvNamespaceId, health?.configured]);

  async function initializeDatabase() {
    setInitializing(true);
    setInitResult(null);
    try {
      const result = await apiFetch<{ driver: string; ready: boolean; schemaInitialized: boolean }>("/api/admin/database", {
        method: "POST",
        body: {},
      });
      setInitResult({
        ok: Boolean(result.schemaInitialized),
        message: `Skema terpasang pada driver ${String(result.driver).toUpperCase()}. Tabel files, storages, dan upload_sessions siap dipakai.`,
      });
      toast({ tone: "success", title: "Database diinisialisasi", description: "Skema berhasil dipasang tanpa terminal." });
      await checkHealth();
    } catch (caught) {
      setInitResult({ ok: false, message: errorMessage(caught, "Gagal menginisialisasi database") });
      toast({ tone: "danger", title: "Inisialisasi gagal", description: errorMessage(caught) });
    } finally {
      setInitializing(false);
    }
  }

  return (
    <div className="relative min-h-dvh bg-void">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_10%_-10%,rgba(14,165,233,0.14),transparent),radial-gradient(50rem_35rem_at_100%_10%,rgba(99,102,241,0.12),transparent)]" />

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="shrink-0 text-slate-300 transition-colors hover:text-white" aria-label="Kembali ke beranda">
            <Wrench className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-white">Setup Assistant</h1>
            <p className="truncate text-[11px] text-slate-500">Siapkan Katsu R2 Manager sepenuhnya dari browser — tanpa terminal</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/docs/getting-started">
              <Button variant="ghost" size="sm">
                Dokumentasi
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <ShieldCheck className="size-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="glass flex gap-2 overflow-x-auto rounded-2xl p-2 scrollbar-thin lg:flex-col lg:overflow-visible">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <a
                  key={step.id}
                  href={`#${step.id}`}
                  className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:shrink"
                >
                  <span className="grid size-6 place-items-center rounded-lg bg-white/[0.06] text-[11px] text-slate-300 tabular-nums">
                    {index + 1}
                  </span>
                  <Icon className="size-3.5 lg:hidden" />
                  <span className="hidden lg:inline">{step.label}</span>
                  <span className="lg:hidden">{step.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="glass mt-3 hidden rounded-2xl p-4 lg:block">
            <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Kesiapan setup</p>
            <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{progress}%</p>
            <Progress value={progress} size="sm" className="mt-2" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Lima hal yang harus selesai: hash password, SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, database, dan konfigurasi lengkap.
            </p>
          </div>
        </aside>

        <div className="space-y-6">
          <section id="status" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="1 · Status sistem saat ini"
                description="Dibaca langsung dari endpoint /api/health aplikasi ini"
                icon={<Activity className="size-4 text-brand-300" />}
                action={
                  <Button size="xs" variant="outline" onClick={() => void checkHealth()} loading={healthLoading}>
                    <RefreshCw className="size-3.5" />
                    Periksa
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                {healthLoading && !health ? (
                  <Skeleton className="h-24 rounded-2xl" />
                ) : healthError ? (
                  <Alert tone="danger" title="Tidak dapat membaca status">
                    {healthError}
                  </Alert>
                ) : health ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        { label: "Status", value: health.status.toUpperCase(), tone: health.status === "ok" ? "success" : "warning" },
                        { label: "Driver database", value: health.database.driver.toUpperCase(), tone: "neutral" },
                        { label: "Skema", value: health.database.schemaInitialized ? "Terpasang" : "Belum", tone: health.database.schemaInitialized ? "success" : "danger" },
                        { label: "Mode demo", value: health.demoMode ? "Aktif" : "Nonaktif", tone: health.demoMode ? "warning" : "neutral" },
                      ].map((row) => (
                        <div key={row.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                          <p className="text-[10px] tracking-wide text-slate-500 uppercase">{row.label}</p>
                          <p className="mt-1 flex items-center gap-2">
                            <Badge tone={row.tone as "success" | "warning" | "neutral" | "danger"}>{row.value}</Badge>
                          </p>
                        </div>
                      ))}
                    </div>

                    {health.configured ? (
                      <Alert tone="success" title="Konfigurasi lengkap">
                        Aplikasi sudah siap dipakai. Anda tetap bisa memakai halaman ini untuk membuat password atau secret baru.
                      </Alert>
                    ) : (
                      <Alert tone="warning" title={`${health.blockingIssues} variabel wajib belum terisi`}>
                        Ikuti langkah 2 sampai 4 di bawah, salin hasilnya ke dashboard hosting Anda, lalu deploy ulang. Setelah itu kembali
                        ke halaman ini dan tekan <span className="font-medium text-white">Periksa</span>.
                      </Alert>
                    )}
                  </>
                ) : null}
              </CardBody>
            </Card>
          </section>

          <section id="password" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="2 · Buat ADMIN_PASSWORD_HASH"
                description="Password di-hash di browser Anda dengan PBKDF2-SHA256 (Web Crypto) dan tidak pernah dikirim ke server"
                icon={<KeyRound className="size-4 text-accent-300" />}
              />
              <CardBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Username admin" hint="Nilai untuk ADMIN_USERNAME" htmlFor="setup-username">
                    {(id) => <Input id={id} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="katsu" autoComplete="off" />}
                  </Field>
                  <Field label="Iterations PBKDF2" hint={`Minimal ${MIN_RECOMMENDED_ITERATIONS.toLocaleString("id-ID")}`} htmlFor="setup-iterations">
                    {(id) => (
                      <Select id={id} value={String(iterations)} onChange={(event) => setIterations(Number(event.target.value))}>
                        {ITERATION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option.toLocaleString("id-ID")}
                            {option < MIN_RECOMMENDED_ITERATIONS ? " (lemah)" : ""}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Password" required hint="Minimal 8 karakter" htmlFor="setup-password">
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password admin"
                        autoComplete="new-password"
                      />
                    )}
                  </Field>
                  <Field label="Ulangi password" required htmlFor="setup-confirm">
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="Ketik ulang"
                        autoComplete="new-password"
                      />
                    )}
                  </Field>
                </div>

                {hashError ? (
                  <Alert tone="danger" title="Belum bisa dibuat">
                    {hashError}
                  </Alert>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => void generateHash()} loading={hashing} disabled={hashing}>
                    <KeyRound className="size-4" />
                    Buat hash
                  </Button>
                  {hash ? (
                    <span className="flex items-center gap-1.5 text-[12px] text-emerald-300">
                      <CheckCircle2 className="size-4" />
                      {inspectPasswordHash(hash).iterations.toLocaleString("id-ID")} iterations · siap dipakai
                    </span>
                  ) : null}
                </div>

                {hash ? (
                  <GeneratedValue
                    label="ADMIN_PASSWORD_HASH"
                    value={hash}
                    hint="Format: pbkdf2-sha256$iterations$salt$hash. Simpan sebagai Secret di dashboard hosting, lalu deploy ulang."
                  />
                ) : null}

                <Alert tone="info" title="Mengganti password nanti">
                  Buat hash baru di halaman ini, ganti nilai <code className="rounded bg-white/[0.06] px-1">ADMIN_PASSWORD_HASH</code>, lalu
                  deploy ulang. Semua sesi lama tetap berlaku sampai kedaluwarsa — ganti juga{" "}
                  <code className="rounded bg-white/[0.06] px-1">SESSION_SECRET</code> bila ingin mengeluarkan semua perangkat sekaligus.
                </Alert>
              </CardBody>
            </Card>
          </section>

          <section id="secrets" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="3 · Buat kunci rahasia"
                description="Dibuat acak 256-bit di perangkat Anda (Web Crypto)"
                icon={<ShieldCheck className="size-4 text-emerald-300" />}
                action={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setSessionSecret(randomToken(32));
                      setEncryptionKey(randomToken(32));
                      setDownloadSecret(randomToken(32));
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    Acak semua
                  </Button>
                }
              />
              <CardBody className="space-y-3">
                <GeneratedValue
                  label="SESSION_SECRET"
                  value={sessionSecret}
                  secret
                  onRegenerate={() => setSessionSecret(randomToken(32))}
                  hint="Menandatangani cookie sesi admin (HMAC-SHA256). Mengganti nilai ini mengakhiri semua sesi yang sedang aktif."
                />
                <GeneratedValue
                  label="CREDENTIAL_ENCRYPTION_KEY"
                  value={encryptionKey}
                  secret
                  onRegenerate={() => setEncryptionKey(randomToken(32))}
                  hint="Mengenkripsi Access Key & Secret Access Key R2 dengan AES-256-GCM sebelum disimpan. JANGAN diganti setelah ada storage tersimpan — kredensial lama tidak bisa dibaca lagi."
                />
                <GeneratedValue
                  label="DOWNLOAD_SIGNING_SECRET"
                  value={downloadSecret}
                  secret
                  onRegenerate={() => setDownloadSecret(randomToken(32))}
                  hint="Opsional. Menandatangani tautan unduhan sementara dan mode DOWNLOAD_MODE=worker. Bila kosong, SESSION_SECRET dipakai."
                />
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-[12px] text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Simpan ketiga nilai ini di tempat aman. Nilainya tidak bisa dipulihkan dari aplikasi, dan{" "}
                    <span className="font-medium">CREDENTIAL_ENCRYPTION_KEY yang hilang berarti kredensial R2 harus diisi ulang</span> untuk
                    setiap storage.
                  </p>
                </div>
              </CardBody>
            </Card>
          </section>

          <section id="database" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="4 · Siapkan database"
                description="Cloudflare D1 (disarankan) atau KV — keduanya dibuat lewat dashboard"
                icon={<Database className="size-4 text-brand-300" />}
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["d1", "kv"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDriver(option)}
                      className={cn(
                        "rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-all",
                        driver === option
                          ? "border-brand-400/40 bg-brand-500/12 text-white"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
                      )}
                    >
                      {option === "d1" ? "Cloudflare D1 (SQL)" : "Cloudflare KV (key-value)"}
                    </button>
                  ))}
                </div>

                {driver === "d1" ? (
                  <ol className="space-y-2 text-[13px] text-slate-300">
                    {[
                      "Cloudflare Dashboard → Storage & Databases → D1 → Create database. Beri nama bebas, misalnya katsu-manager.",
                      "Buka database yang baru dibuat, salin Database ID, lalu tempel ke kolom DATABASE_ID di bawah.",
                      "My Profile → API Tokens → Create Token → Custom token. Beri izin Account → D1 → Edit, batasi ke akun Anda, lalu salin token ke CLOUDFLARE_API_TOKEN.",
                      "Salin Account ID (halaman overview akun, kolom kanan) ke CLOUDFLARE_ACCOUNT_ID.",
                      "Simpan ketiga variabel di dashboard hosting, deploy ulang, lalu tekan tombol Inisialisasi di bawah untuk memasang skema.",
                    ].map((step, index) => (
                      <li key={step} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[11px] text-slate-300 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="space-y-2 text-[13px] text-slate-300">
                    {[
                      "Cloudflare Dashboard → Workers & Pages → KV → Create namespace, misalnya katsu-kv.",
                      "Salin Namespace ID ke kolom KV_NAMESPACE_ID di bawah.",
                      "Buat API Token dengan izin Account → Workers KV → Edit, lalu tempel ke CLOUDFLARE_API_TOKEN.",
                      "Isi CLOUDFLARE_ACCOUNT_ID, simpan variabelnya di dashboard hosting, lalu deploy ulang.",
                      "KV cocok untuk instalasi cepat; pencarian dan agregasi lebih terbatas dibanding D1.",
                    ].map((step, index) => (
                      <li key={step} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[11px] text-slate-300 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}

                <Alert tone="info" title="Kenapa butuh API Token?">
                  <p className="text-[12px] leading-relaxed">
                    Aplikasi ini berbicara ke Cloudflare lewat HTTP API resmi, bukan lewat binding worker. Dengan begitu satu kode yang sama
                    bisa berjalan di Cloudflare Workers/Pages <span className="font-medium text-white">maupun di Vercel</span>, dan tombol
                    inisialisasi database tetap berfungsi dari browser. Token hanya butuh izin D1 (atau KV) — tidak perlu izin R2, karena
                    kredensial tiap bucket diisi lewat dashboard admin dan disimpan terenkripsi.
                  </p>
                </Alert>

                <div className="grid gap-4 sm:grid-cols-2">
                  {driver === "d1" ? (
                    <Field label="DATABASE_ID" required hint="ID database D1 (32 karakter heksadesimal)" htmlFor="setup-database-id">
                      {(id) => <Input id={id} value={databaseId} onChange={(event) => setDatabaseId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" spellCheck={false} />}
                    </Field>
                  ) : (
                    <Field label="KV_NAMESPACE_ID" required hint="ID namespace KV" htmlFor="setup-kv-id">
                      {(id) => <Input id={id} value={kvNamespaceId} onChange={(event) => setKvNamespaceId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" spellCheck={false} />}
                    </Field>
                  )}
                  <Field label="CLOUDFLARE_ACCOUNT_ID" required hint="32 karakter heksadesimal dari dashboard" htmlFor="setup-account-id">
                    {(id) => <Input id={id} value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="e4a1c9f0b7d84a2f9c1e6d3b8a5f2c47" spellCheck={false} />}
                  </Field>
                  <Field
                    label="CLOUDFLARE_API_TOKEN"
                    required
                    hint={driver === "d1" ? "Izin Account → D1 → Edit" : "Izin Account → Workers KV → Edit"}
                    htmlFor="setup-api-token"
                    className="sm:col-span-2"
                  >
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        value={apiToken}
                        onChange={(event) => setApiToken(event.target.value)}
                        placeholder="Tempel token di sini (hanya disimpan di browser untuk pratinjau)"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                  </Field>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium text-white">Inisialisasi skema database</p>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        Membuat tabel <code className="rounded bg-white/[0.06] px-1">files</code>,{" "}
                        <code className="rounded bg-white/[0.06] px-1">storages</code>, dan{" "}
                        <code className="rounded bg-white/[0.06] px-1">upload_sessions</code> sekaligus — pengganti perintah migrasi CLI.
                        Tombol ini memakai variabel yang sudah ter-deploy, jadi simpan DATABASE_ID, CLOUDFLARE_ACCOUNT_ID, dan
                        CLOUDFLARE_API_TOKEN lalu deploy ulang lebih dulu.
                      </p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => void initializeDatabase()} loading={initializing} disabled={initializing || !session?.authenticated}>
                      <CheckCircle2 className="size-4" />
                      Inisialisasi sekarang
                    </Button>
                  </div>

                  {!session?.authenticated ? (
                    <p className="mt-3 flex items-start gap-2 text-[12px] text-amber-200">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      Tombol ini butuh sesi admin.{" "}
                      <Link href="/admin/login?next=%2Fsetup" className="font-medium underline underline-offset-2">
                        Masuk dulu
                      </Link>{" "}
                      (setelah ADMIN_PASSWORD_HASH terpasang), lalu kembali ke halaman ini.
                    </p>
                  ) : null}

                  {initResult ? (
                    <div className="mt-3">
                      <Alert tone={initResult.ok ? "success" : "danger"} title={initResult.ok ? "Berhasil" : "Gagal"}>
                        {initResult.message}
                      </Alert>
                    </div>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          </section>

          <section id="storage" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="5 · Hubungkan storage Cloudflare R2"
                description="Dilakukan lewat dashboard admin, bukan lewat halaman ini"
                icon={<ServerCog className="size-4 text-accent-300" />}
              />
              <CardBody className="space-y-3">
                <ol className="space-y-2 text-[13px] text-slate-300">
                  {[
                    "Di dashboard Cloudflare, buka R2 Object Storage → Create bucket (misalnya katsu-media).",
                    "Masih di menu R2, buka API Tokens → Create API Token. Beri izin Object Read & Write untuk bucket tersebut.",
                    "Salin Access Key ID dan Secret Access Key yang muncul sekali saja.",
                    "Di aplikasi ini, buka Admin → Storage R2 → Tambah storage, isi Account ID, nama bucket, Access Key, Secret, dan batas kapasitas.",
                    "Tekan Tes koneksi — empat langkah verifikasi akan memastikan bucket benar-benar bisa dibaca dan ditulis.",
                  ].map((step, index) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[11px] text-slate-300 tabular-nums">
                        {index + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-2">
                  <Link href="/admin/storage">
                    <Button size="sm" variant="primary">
                      <Cloud className="size-4" />
                      Buka Storage R2
                    </Button>
                  </Link>
                  <Link href="/docs/r2-setup">
                    <Button size="sm" variant="outline">
                      Panduan lengkap R2
                    </Button>
                  </Link>
                </div>

                <Alert tone="info" title="Kredensial tidak pernah keluar dari backend">
                  Access Key dan Secret disimpan terenkripsi AES-256-GCM di database dan hanya dipakai server saat menandatangani permintaan
                  S3. Browser hanya menerima URL sementara (presigned) untuk bagian-bagian upload.
                </Alert>
              </CardBody>
            </Card>
          </section>

          <section id="deploy" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="6 · Simpan variabel & deploy"
                description="Semua langkah dilakukan lewat dashboard hosting — tidak ada perintah terminal"
                icon={<Rocket className="size-4 text-emerald-300" />}
                action={<CopyButton value={envPreview} label="Semua environment variables" />}
              />
              <CardBody className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-white">
                      <Cloud className="size-4 text-brand-300" />
                      Cloudflare Workers &amp; Pages
                    </p>
                    <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
                      <li>1. Workers &amp; Pages → Create → tab Pages/Workers → Connect to Git → pilih repositori ini.</li>
                      <li>
                        2. Build command: <code className="rounded bg-white/[0.06] px-1">npx opennextjs-cloudflare build</code>, output
                        directory <code className="rounded bg-white/[0.06] px-1">.open-next</code>.
                      </li>
                      <li>3. Settings → Variables and Secrets → tambahkan setiap variabel di bawah (pilih tipe Secret untuk kunci rahasia).</li>
                      <li>4. Tidak perlu binding apa pun: aplikasi memakai HTTP API Cloudflare (DATABASE_ID + CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN).</li>
                      <li>5. Deployments → Retry/Redeploy agar variabel baru terbaca, lalu buka /setup untuk inisialisasi database.</li>
                    </ol>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-white">
                      <FileTerminal className="size-4 text-accent-300" />
                      Vercel
                    </p>
                    <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
                      <li>1. Add New → Project → impor repositori ini (framework terdeteksi otomatis: Next.js).</li>
                      <li>2. Project → Settings → Environment Variables → tempel variabel di bawah untuk Production, Preview, dan Development.</li>
                      <li>3. Database tetap di Cloudflare: isi DATABASE_ID (atau KV_NAMESPACE_ID) plus CLOUDFLARE_ACCOUNT_ID dan CLOUDFLARE_API_TOKEN — aplikasi mengaksesnya lewat HTTP API resmi.</li>
                      <li>4. Deployments → Redeploy setelah variabel ditambahkan.</li>
                    </ol>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-medium text-slate-300">Pratinjau environment variables</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={async () => {
                          const ok = await copy(envPreview);
                          toast(
                            ok
                              ? { tone: "success", title: "Disalin ke clipboard", description: "Tempel di dashboard hosting Anda." }
                              : { tone: "danger", title: "Gagal menyalin", description: "Salin manual dari kotak di bawah." },
                          );
                        }}
                      >
                        <Copy className="size-3.5" />
                        Salin semua
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-80 overflow-auto rounded-2xl border border-white/[0.06] bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-slate-300 scrollbar-thin">
                    {envPreview}
                  </pre>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                  <Link href="/admin">
                    <Button variant="primary" size="sm">
                      <ShieldCheck className="size-4" />
                      Buka dashboard admin
                    </Button>
                  </Link>
                  <Link href="/docs/deployment">
                    <Button variant="outline" size="sm">
                      Panduan deploy detail
                    </Button>
                  </Link>
                  <Link href="/docs/environment-variables">
                    <Button variant="ghost" size="sm">
                      Referensi variabel
                    </Button>
                  </Link>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Check className="size-3.5 text-emerald-400" />
                    Tanpa terminal, tanpa VPS
                  </span>
                </div>
              </CardBody>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
