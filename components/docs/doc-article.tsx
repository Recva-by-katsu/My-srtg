import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, Pencil } from "lucide-react";
import type { DocPage } from "@/docs/types";
import { extractHeadings } from "@/docs/markdown";
import { getNeighbours } from "@/docs/registry";
import { MarkdownView } from "@/components/docs/markdown-view";
import { DocsToc } from "@/components/docs/docs-toc";
import { Badge } from "@/components/ui/badge";

export function DocArticle({ page }: { page: DocPage }) {
  const headings = extractHeadings(page.body);
  const { previous, next } = getNeighbours(page.slug);

  return (
    <div className="mx-auto w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_15rem]">
      <article className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[12px] text-slate-500">
          <Link href="/docs" className="transition-colors hover:text-brand-300">
            Dokumentasi
          </Link>
          <span>/</span>
          <span className="text-slate-400">{page.group}</span>
        </nav>

        <header className="mb-8">
          <Badge tone="brand" className="mb-3">
            {page.group}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{page.title}</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-400">{page.description}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            <CalendarClock className="size-3.5" />
            Terakhir diperbarui {page.updated}
          </p>
        </header>

        <DocsToc headings={headings} variant="collapse" />

        <MarkdownView source={page.body} />

        <nav className="mt-14 grid gap-3 border-t border-white/8 pt-6 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/docs/${previous.slug}`}
              className="glass glass-hover group flex items-center gap-3 rounded-2xl p-4"
            >
              <ArrowLeft className="size-4 shrink-0 text-brand-300 transition-transform group-hover:-translate-x-0.5" />
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-[0.12em] text-slate-500">Sebelumnya</span>
                <span className="block truncate text-[13.5px] font-medium text-white">{previous.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="glass glass-hover group flex items-center justify-end gap-3 rounded-2xl p-4 text-right"
            >
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-[0.12em] text-slate-500">Berikutnya</span>
                <span className="block truncate text-[13.5px] font-medium text-white">{next.title}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-brand-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <p className="mt-8 flex items-center gap-2 text-[12px] text-slate-600">
          <Pencil className="size-3.5" />
          Konten halaman ini berada di <code className="font-mono text-slate-500">docs/content/{page.slug}.ts</code>
        </p>
      </article>

      <DocsToc headings={headings} variant="rail" />
    </div>
  );
}
