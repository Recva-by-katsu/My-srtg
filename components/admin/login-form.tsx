"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, Cloud, KeyRound, Lock, ShieldAlert, User } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/input";
import { apiFetch, errorMessage, fieldIssues } from "@/lib/client/api";
import { useSession } from "@/lib/hooks/use-session";

interface LoginResponse {
  username: string;
  expiresAt: string;
  csrfToken: string;
}

function safeNext(value: string | null): string {
  if (!value) return "/admin";
  if (!value.startsWith("/")) return "/admin";
  if (value.startsWith("//")) return "/admin";
  if (value.startsWith("/admin/login")) return "/admin";
  return value;
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const { session, loading: sessionLoading } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (session?.authenticated) router.replace(next);
  }, [session?.authenticated, next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setIssues({});

    try {
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { username: username.trim(), password, remember },
        skipCsrf: true,
      });
      router.replace(next);
      router.refresh();
      void result;
    } catch (caught) {
      setError(errorMessage(caught, "Login gagal"));
      setIssues(fieldIssues(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const notConfigured = session !== null && !session.adminConfigured;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-void px-4 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55rem_40rem_at_50%_-10%,rgba(14,165,233,0.16),transparent),radial-gradient(45rem_30rem_at_90%_100%,rgba(99,102,241,0.12),transparent)]" />

      <div className="animate-fade-up w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-white sm:text-2xl">Masuk ke dashboard admin</h1>
            <p className="text-[13px] text-slate-400">
              Kelola storage pool Cloudflare R2, unggah file besar, dan pantau unduhan publik.
            </p>
          </div>
        </div>

        <div className="glass-strong rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-7">
          {notConfigured ? (
            <Alert tone="warning" title="Admin belum diaktifkan" className="mb-5">
              <p className="text-[13px] leading-relaxed">
                Environment variable <code className="rounded bg-white/[0.06] px-1 py-0.5">ADMIN_PASSWORD_HASH</code> dan{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5">SESSION_SECRET</code> belum diisi. Buat keduanya lewat{" "}
                <Link href="/setup" className="font-medium text-brand-300 underline underline-offset-2">
                  Setup Assistant
                </Link>{" "}
                lalu simpan di dashboard hosting Anda.
              </p>
            </Alert>
          ) : null}

          {sessionLoading && !session ? (
            <p className="mb-4 text-center text-xs text-slate-500">Memeriksa sesi…</p>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Username" required error={issues.username} htmlFor="login-username">
              {(id) => (
                <div className="relative">
                  <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id={id}
                    name="username"
                    autoComplete="username"
                    className="pl-10"
                    placeholder="admin"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </div>
              )}
            </Field>

            <Field label="Password" required error={issues.password} htmlFor="login-password">
              {(id) => (
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id={id}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-24 pl-10"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    {showPassword ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>
              )}
            </Field>

            <Switch
              checked={remember}
              onChange={setRemember}
              label="Ingat saya di perangkat ini"
              description="Memperpanjang masa sesi hingga 7 hari."
            />

            {error ? (
              <Alert tone="danger" title="Login ditolak">
                {error}
              </Alert>
            ) : null}

            <Button type="submit" variant="primary" size="md" fullWidth loading={submitting} disabled={submitting}>
              <KeyRound className="size-4" />
              Masuk
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[12px] text-slate-500">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.05] hover:text-slate-200">
            <Cloud className="size-3.5" />
            Download Center
          </Link>
          <Link
            href="/docs/security"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
          >
            <ShieldAlert className="size-3.5" />
            Keamanan
          </Link>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
          >
            <BookOpen className="size-3.5" />
            Dokumentasi
          </Link>
        </div>
      </div>
    </div>
  );
}
