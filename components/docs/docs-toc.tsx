"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import type { DocHeading } from "@/docs/types";
import { cn } from "@/lib/utils/cn";

export function DocsToc({
  headings,
  variant = "collapse",
}: {
  headings: DocHeading[];
  /** `collapse` renders the mobile accordion, `rail` the sticky desktop column. */
  variant?: "collapse" | "rail";
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: [0, 0.5, 1] },
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  const list = (
    <ul className="space-y-1">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "block border-l-2 py-1.5 text-[12.5px] leading-snug transition-colors",
              heading.level === 3 ? "pl-6" : "pl-3",
              activeId === heading.id
                ? "border-brand-400 font-medium text-brand-200"
                : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200",
            )}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === "rail") {
    return (
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto pl-2 xl:block scrollbar-thin">
        <p className="mb-3 pl-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Di halaman ini
        </p>
        {list}
      </aside>
    );
  }

  return (
    <div className="mb-6 xl:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="glass flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-200"
          aria-expanded={mobileOpen}
        >
          <span className="inline-flex items-center gap-2">
            <List className="size-4 text-brand-300" />
            Daftar isi
          </span>
          <span className="text-[11px] text-slate-500">{headings.length} bagian</span>
        </button>
      {mobileOpen ? <div className="glass mt-2 rounded-xl p-3 animate-fade-in">{list}</div> : null}
    </div>
  );
}
