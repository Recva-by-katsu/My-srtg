"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Cloud,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  ServerCog,
  Settings,
  ShieldCheck,
  UploadCloud,
  Wrench,
  X,
} from "lucide-react";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/lib/hooks/use-session";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Ringkasan", description: "Statistik & kesehatan sistem", icon: LayoutDashboard },
  { href: "/admin/storage", label: "Storage R2", description: "Kelola akun Cloudflare R2", icon: ServerCog },
  { href: "/admin/upload", label: "Upload", description: "Kirim file ke storage pool", icon: UploadCloud },
  { href: "/admin/files", label: "File Manager", description: "Cari, pindah, hapus file", icon: FolderOpen },
  { href: "/admin/settings", label: "Pengaturan", description: "Database & diagnostik", icon: Settings },
];

const SECONDARY_NAV = [
  { href: "/", label: "Download Center", icon: Cloud },
  { href: "/docs", label: "Dokumentasi", icon: BookOpen },
  { href: "/setup", label: "Setup Assistant", icon: Wrench },
];

function titleFor(pathname: string): NavItem | undefined {
  if (pathname === "/admin") return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => pathname.startsWith(item.href));
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const needsSetup = session !== null && !session.adminConfigured;

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      // A failed logout call still ends the local navigation flow below.
    }
    router.replace("/admin/login");
    router.refresh();
  }, [router]);

  const active = titleFor(pathname);
  const expiresLabel = session?.expiresAt ? formatRelativeTime(session.expiresAt) : null;

  // Guard: redirect unauthenticated visitors to the login page.
  useEffect(() => {
    if (loading || !session) return;
    if (session.authenticated) return;
    if (!session.adminConfigured) return; // the setup screen is rendered instead
    const next = encodeURIComponent(`${pathname}`);
    router.replace(`/admin/login?next=${next}`);
  }, [loading, session, pathname, router]);

  if (loading && !session) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-56" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="glass grid size-16 place-items-center rounded-2xl">
          <ShieldCheck className="size-8 text-amber-300" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-white">Admin belum terkonfigurasi</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Environment variable <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-brand-200">ADMIN_PASSWORD_HASH</code> dan{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-brand-200">SESSION_SECRET</code> masih kosong, jadi dashboard
            belum bisa digunakan. Buka Setup Assistant untuk membuat keduanya langsung dari browser — tanpa terminal.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/setup">
            <Button variant="primary" size="md">
              <Wrench className="size-4" />
              Buka Setup Assistant
            </Button>
          </Link>
          <Link href="/docs/environment-variables">
            <Button variant="outline" size="md">
              <BookOpen className="size-4" />
              Panduan environment
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Skeleton className="size-14 rounded-2xl" />
        <p className="text-sm text-slate-400">Mengalihkan ke halaman login…</p>
        <Link href="/admin/login">
          <Button variant="outline" size="sm">
            Ke halaman login
          </Button>
        </Link>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/admin" className="rounded-xl" aria-label="Katsu R2 Manager - dashboard admin">
        <Logo />
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all",
                isActive
                  ? "bg-brand-500/12 text-white ring-1 ring-brand-400/25"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", isActive ? "text-brand-300" : "text-slate-500 group-hover:text-brand-300")} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{item.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Sesi admin</p>
          <p className="mt-1 truncate text-[13px] font-medium text-white">{session.username ?? "admin"}</p>
          {expiresLabel ? <p className="mt-0.5 text-[11px] text-slate-500">Berakhir {expiresLabel}</p> : null}
          <Button variant="ghost" size="xs" className="mt-2 w-full justify-center" onClick={logout} loading={loggingOut}>
            <LogOut className="size-3.5" />
            Keluar
          </Button>
        </div>

        <nav className="flex flex-col gap-0.5 border-t border-white/[0.06] pt-3">
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-void">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_15%_-10%,rgba(14,165,233,0.12),transparent),radial-gradient(50rem_35rem_at_100%_0%,rgba(99,102,241,0.10),transparent)]" />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.06] bg-abyss/80 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-fade-in absolute inset-y-0 left-0 w-72 border-r border-white/[0.08] bg-abyss/95 backdrop-blur-xl">
            <button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-void/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              aria-label="Buka menu navigasi"
              onClick={() => setDrawerOpen(true)}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:text-white lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold text-white sm:text-base">{active?.label ?? "Dashboard Admin"}</h1>
              <p className="truncate text-[11px] text-slate-500 sm:text-xs">{active?.description ?? "Katsu R2 Manager"}</p>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/" className="rounded-xl">
                <Button variant="ghost" size="sm">
                  <Cloud className="size-4" />
                  Situs publik
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={logout} loading={loggingOut}>
                <LogOut className="size-4" />
                Keluar
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
