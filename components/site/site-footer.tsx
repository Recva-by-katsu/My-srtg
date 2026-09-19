import Link from "next/link";
import { CloudCog, Heart } from "lucide-react";
import { Logo } from "@/components/site/logo";

const COLUMNS = [
  {
    title: "Produk",
    links: [
      { href: "/", label: "Download Center" },
      { href: "/admin", label: "Admin Dashboard" },
      { href: "/admin/upload", label: "Upload Manager" },
      { href: "/admin/storage", label: "Storage Pool" },
    ],
  },
  {
    title: "Dokumentasi",
    links: [
      { href: "/docs", label: "Getting Started" },
      { href: "/docs/r2-setup", label: "Cloudflare R2 Setup" },
      { href: "/docs/deployment", label: "Deployment" },
      { href: "/docs/security", label: "Security Guide" },
    ],
  },
  {
    title: "Bantuan",
    links: [
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/faq", label: "FAQ" },
      { href: "/setup", label: "Setup Assistant" },
      { href: "/api/health", label: "Status Sistem" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/5 bg-abyss/60">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div className="max-w-sm">
            <Logo subtitle="Personal cloud storage pool" />
            <p className="mt-4 text-[13px] leading-relaxed text-slate-400">
              Menggabungkan banyak akun Cloudflare R2 menjadi satu storage pool. Upload lewat browser,
              bagikan lewat satu domain download - tanpa terminal, tanpa CLI.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {column.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-slate-400 transition-colors hover:text-brand-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-[12px] text-slate-500 sm:flex-row">
          <p className="inline-flex items-center gap-1.5">
            Dibuat dengan <Heart className="size-3.5 text-rose-400" /> di atas Cloudflare R2 &amp; Next.js
          </p>
          <p className="inline-flex items-center gap-1.5">
            <CloudCog className="size-3.5" />
            Katsu R2 Manager · MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
