"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Cloud, Menu, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/", label: "Download Center", icon: Cloud },
  { href: "/docs", label: "Dokumentasi", icon: BookOpen },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-void/70 backdrop-blur-xl">
      <div className={cn("mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6", compact ? "h-14" : "h-16")}>
        <Link href="/" className="shrink-0 rounded-xl" aria-label="Katsu R2 Manager - beranda">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all",
                  active
                    ? "bg-white/[0.08] text-white ring-1 ring-white/10"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:text-white md:hidden"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-white/5 bg-abyss/95 px-4 py-3 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    active ? "bg-white/[0.08] text-white" : "text-slate-300 hover:bg-white/[0.05]",
                  )}
                >
                  <Icon className="size-4 text-brand-300" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
