export type DocIcon =
  | "rocket"
  | "cloud"
  | "database"
  | "upload"
  | "folder"
  | "download"
  | "shield"
  | "wrench"
  | "help"
  | "key"
  | "server"
  | "gauge";

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocPage {
  slug: string;
  title: string;
  group: string;
  order: number;
  description: string;
  icon: DocIcon;
  updated: string;
  body: string;
}

export interface DocGroup {
  name: string;
  order: number;
  pages: DocPage[];
}

export interface DocSearchEntry {
  slug: string;
  title: string;
  description: string;
  group: string;
  headings: Array<{ id: string; text: string }>;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Sidebar projection
// ---------------------------------------------------------------------------

/**
 * The sidebar is a client component while the docs layout renders on the
 * server, so the data it needs is projected here (a plain module, importable
 * from both sides) instead of inside the component file.
 */

export interface SidebarPage {
  slug: string;
  title: string;
  icon: DocIcon;
}

export interface SidebarGroup {
  name: string;
  pages: SidebarPage[];
}

export function toSidebarGroups(groups: DocGroup[]): SidebarGroup[] {
  return groups.map((group) => ({
    name: group.name,
    pages: group.pages.map((page) => ({ slug: page.slug, title: page.title, icon: page.icon })),
  }));
}
