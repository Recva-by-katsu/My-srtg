import type { ReactNode } from "react";
import { extractHeadings } from "@/docs/markdown";
import { buildSearchIndex, DOC_PAGES, getDocGroups } from "@/docs/registry";
import { toSidebarGroups } from "@/docs/types";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata = {
  title: "Dokumentasi",
  description:
    "Dokumentasi lengkap Katsu R2 Manager: setup Cloudflare R2, D1/KV, deployment lewat dashboard, upload multipart, manajemen file, download system, keamanan, troubleshooting, dan FAQ.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  const headings = Object.fromEntries(
    DOC_PAGES.map((page) => [
      page.slug,
      extractHeadings(page.body).map((heading) => ({ id: heading.id, text: heading.text })),
    ]),
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader compact />
      <div className="flex flex-1">
        <DocsSidebar groups={toSidebarGroups(getDocGroups())} searchIndex={buildSearchIndex(headings)} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
