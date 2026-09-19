"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cloud,
  Database,
  Download,
  FolderTree,
  Gauge,
  HelpCircle,
  KeyRound,
  Rocket,
  Server,
  Shield,
  Upload,
  Wrench,
  Menu,
  X,
} from "lucide-react";
import type { DocIcon, DocSearchEntry, SidebarGroup } from "@/docs/types";
import { DocsSearch } from "@/components/docs/docs-search";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<DocIcon, typeof Rocket> = {
  rocket: Rocket,
  cloud: Cloud,
  database: Database,
  upload: Upload,
  folder: FolderTree,
  download: Download,
  shield: Shield,
  wrench: Wrench,
  help: HelpCircle,
  key: KeyRound,
  server: Server,
  gauge: Gauge,
};

export function DocsSidebar({
  groups,
  searchIndex,
}: {
  groups: SidebarGroup[];
  searchIndex: DocSearchEntry[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const nav = (
    <nav className="space-y-6 pb-8">
      {groups.map((group) => (
        <div key={group.name}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {group.name}
          </p>
          <ul className="space-y-0.5">
            {group.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href;
              const Icon = ICONS[page.icon] ?? Rocket;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all",
                      active
                        ? "bg-gradient-to-r from-brand-500/15 to-accent-500/10 font-medium text-white ring-1 ring-brand-400/25"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active ? "text-brand-300" : "text-slate-500 group-hover:text-brand-300",
                      )}
                    />
                    <span className="truncate">{page.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mx-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="text-[12px] font-semibold text-slate-200">Butuh bantuan setup?</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
          Setup Assistant menuntun Anda membuat password hash, secret, dan env variables - semuanya dari
          browser.
        </p>
        <Link
          href="/setup"
          className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 text-[12px] font-semibold text-white transition-all hover:brightness-110"
        >
          <KeyRound className="size-3.5" />
          Buka Setup Assistant
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      {/* mobile trigger */}
      <div className="sticky top-14 z-30 flex items-center gap-2 border-b border-white/5 bg-void/80 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] font-medium text-slate-200"
          aria-label="Buka daftar dokumentasi"
        >
          <Menu className="size-4 text-brand-300" />
          Daftar isi
        </button>
        <div className="flex-1">
          <DocsSearch index={searchIndex} />
        </div>
      </div>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col animate-fade-in">
            <div className="flex items-center justify-between gap-3 border-b border-white/8 p-4">
              <p className="text-[13px] font-semibold text-white">Dokumentasi</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-white/10 text-slate-300"
                aria-label="Tutup daftar dokumentasi"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="border-b border-white/8 p-3">
              <DocsSearch index={searchIndex} />
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-3">{nav}</div>
          </div>
        </div>
      ) : null}

      {/* desktop rail */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-white/5 bg-abyss/40 px-3 py-5 lg:block scrollbar-thin">
        <div className="mb-5 px-1">
          <DocsSearch index={searchIndex} />
        </div>
        {nav}
      </aside>
    </>
  );
}
