"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Search, X } from "lucide-react";
import type { DocSearchEntry } from "@/docs/types";
import { cn } from "@/lib/utils/cn";

interface Result {
  slug: string;
  title: string;
  group: string;
  heading?: string;
  headingId?: string;
  snippet: string;
  score: number;
}

export function DocsSearch({ index }: { index: DocSearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box, like most documentation sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo<Result[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const tokens = term.split(/\s+/);
    const scored: Result[] = [];

    for (const entry of index) {
      const titleLower = entry.title.toLowerCase();
      const descriptionLower = entry.description.toLowerCase();
      const titleHit = tokens.every((token) => titleLower.includes(token));
      const descriptionHit = tokens.every((token) => descriptionLower.includes(token));
      const keywordHits = entry.keywords.filter((keyword) => tokens.some((token) => keyword.includes(token))).length;

      for (const heading of entry.headings) {
        const headingLower = heading.text.toLowerCase();
        if (tokens.every((token) => headingLower.includes(token))) {
          scored.push({
            slug: entry.slug,
            title: entry.title,
            group: entry.group,
            heading: heading.text,
            headingId: heading.id,
            snippet: entry.description,
            score: 60 + keywordHits,
          });
        }
      }

      if (titleHit) {
        scored.push({ slug: entry.slug, title: entry.title, group: entry.group, snippet: entry.description, score: 100 + keywordHits });
      } else if (descriptionHit || keywordHits >= tokens.length) {
        scored.push({
          slug: entry.slug,
          title: entry.title,
          group: entry.group,
          snippet: entry.description,
          score: 40 + keywordHits * 4,
        });
      }
    }

    const unique = new Map<string, Result>();
    for (const result of scored.sort((a, b) => b.score - a.score)) {
      const key = `${result.slug}#${result.headingId ?? ""}`;
      if (!unique.has(key)) unique.set(key, result);
    }
    return [...unique.values()].slice(0, 8);
  }, [index, query]);

  useEffect(() => setActive(0), [query]);

  function go(result: Result) {
    setOpen(false);
    setQuery("");
    router.push(result.headingId ? `/docs/${result.slug}#${result.headingId}` : `/docs/${result.slug}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Cari dokumentasi…"
          aria-label="Cari dokumentasi"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(results.length - 1, value + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              go(results[active]!);
            }
          }}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-14 text-[13px] text-slate-100 placeholder:text-slate-500 transition-colors focus:border-brand-400/60 focus:bg-white/[0.06] focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-white/10 hover:text-white"
            aria-label="Bersihkan pencarian"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            /
          </kbd>
        )}
      </div>

      {open && query.trim() ? (
        <div className="glass-strong absolute z-40 mt-2 w-full overflow-hidden rounded-xl shadow-2xl animate-scale-in">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-400">
              Tidak ada hasil untuk “{query}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1.5 scrollbar-thin">
              {results.map((result, index) => (
                <li key={`${result.slug}-${result.headingId ?? index}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(result)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                      index === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-white">
                        {result.heading ?? result.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                        {result.heading ? `${result.title} › ` : ""}
                        {result.snippet}
                      </span>
                    </span>
                    {index === active ? (
                      <CornerDownLeft className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
