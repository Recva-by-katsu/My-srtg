import type { DocGroup, DocPage, DocSearchEntry } from "@/docs/types";

import { page as gettingStarted } from "@/docs/content/getting-started";
import { page as r2Setup } from "@/docs/content/r2-setup";
import { page as databaseSetup } from "@/docs/content/database-setup";
import { page as deployment } from "@/docs/content/deployment";
import { page as environmentVariables } from "@/docs/content/environment-variables";
import { page as addStorage } from "@/docs/content/add-storage";
import { page as uploadGuide } from "@/docs/content/upload-guide";
import { page as fileManagement } from "@/docs/content/file-management";
import { page as downloadSystem } from "@/docs/content/download-system";
import { page as securityGuide } from "@/docs/content/security";
import { page as troubleshooting } from "@/docs/content/troubleshooting";
import { page as faq } from "@/docs/content/faq";

export const DOC_PAGES: DocPage[] = [
  gettingStarted,
  r2Setup,
  databaseSetup,
  deployment,
  environmentVariables,
  addStorage,
  uploadGuide,
  fileManagement,
  downloadSystem,
  securityGuide,
  troubleshooting,
  faq,
].sort((a, b) => a.order - b.order);

export const DEFAULT_DOC_SLUG = DOC_PAGES[0]?.slug ?? "getting-started";

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function getDocGroups(): DocGroup[] {
  const groups = new Map<string, DocGroup>();
  for (const page of DOC_PAGES) {
    const existing = groups.get(page.group);
    if (existing) {
      existing.pages.push(page);
    } else {
      groups.set(page.group, { name: page.group, order: page.order, pages: [page] });
    }
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

export function getNeighbours(slug: string): { previous?: DocPage; next?: DocPage } {
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  if (index < 0) return {};
  return {
    previous: index > 0 ? DOC_PAGES[index - 1] : undefined,
    next: index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : undefined,
  };
}

const STOP_WORDS = new Set([
  "yang","dan","atau","untuk","dengan","pada","di","ke","dari","adalah","ini","itu","anda","saya","kami",
  "tidak","bisa","akan","sudah","belum","bila","jika","saat","agar","lebih","paling","setiap","semua",
  "the","and","for","with","that","this","from","your","you","are","can","will","not",
]);

function keywordsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    ),
  ].slice(0, 80);
}

/** Pre-computed search index handed to the client search box. */
export function buildSearchIndex(headings: Record<string, Array<{ id: string; text: string }>>): DocSearchEntry[] {
  return DOC_PAGES.map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
    group: page.group,
    headings: headings[page.slug] ?? [],
    keywords: keywordsOf(`${page.title} ${page.description} ${page.body}`),
  }));
}
