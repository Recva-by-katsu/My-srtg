/**
 * Minimal markdown parser used by the in-app documentation site (`/docs`).
 *
 * It covers exactly the constructs the documentation uses - headings, paragraphs,
 * nested lists, tables, fenced code blocks, blockquotes/callouts and inline
 * formatting - and renders them as React elements (no `dangerouslySetInnerHTML`),
 * which keeps the docs site free of HTML injection risks and extra dependencies.
 */

export type CalloutTone = "note" | "tip" | "warning" | "danger";

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: Array<{ text: string; depth: number }> }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; text: string }
  | { type: "callout"; tone: CalloutTone; title: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "hr" };

export interface InlineNode {
  type: "text" | "code" | "bold" | "italic" | "link";
  text: string;
  href?: string;
}

const LIST_PATTERN = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_PATTERN = /^(#{1,4})\s+(.*)$/;
const CALLOUT_PATTERN = /^\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT)\]\s*(.*)$/i;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push({ type: "text", text: text.slice(cursor, match.index) });
    }
    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push({ type: "link", text: linkMatch[1]!, href: linkMatch[2] });
      } else {
        nodes.push({ type: "text", text: token });
      }
    } else if (token.startsWith("**")) {
      nodes.push({ type: "bold", text: token.slice(2, -2) });
    } else {
      nodes.push({ type: "italic", text: token.slice(1, -1) });
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push({ type: "text", text: text.slice(cursor) });
  return nodes;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const headingIds = new Map<string, number>();
  let index = 0;

  const uniqueId = (text: string): string => {
    const base = slugify(text) || "section";
    const seen = headingIds.get(base) ?? 0;
    headingIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  while (index < lines.length) {
    const line = lines[index]!;

    if (!line.trim()) {
      index += 1;
      continue;
    }

    // ------------------------------------------------------------ fenced code
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index]!.trim())) {
        code.push(lines[index]!);
        index += 1;
      }
      index += 1; // skip closing fence
      blocks.push({ type: "code", lang: lang || "text", code: code.join("\n") });
      continue;
    }

    // ---------------------------------------------------------------- heading
    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      const level = Math.min(4, heading[1]!.length) as 1 | 2 | 3 | 4;
      const text = heading[2]!.trim();
      blocks.push({ type: "heading", level, text, id: uniqueId(text) });
      index += 1;
      continue;
    }

    // --------------------------------------------------------------------- hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    // ------------------------------------------------------- quote / callout
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        quote.push(lines[index]!.replace(/^\s*>\s?/, ""));
        index += 1;
      }
      const body = quote.join("\n").trim();
      const callout = CALLOUT_PATTERN.exec(body.split("\n")[0] ?? "");
      if (callout) {
        const tone = callout[1]!.toLowerCase() as CalloutTone | "important";
        const rest = body.split("\n").slice(1).join("\n").trim();
        blocks.push({
          type: "callout",
          tone: tone === "important" ? "note" : tone,
          title: callout[2]?.trim() || defaultCalloutTitle(tone),
          text: rest,
        });
      } else {
        blocks.push({ type: "quote", text: body });
      }
      continue;
    }

    // ------------------------------------------------------------------ table
    if (line.trim().startsWith("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]!)) {
      const head = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.trim().startsWith("|")) {
        rows.push(splitRow(lines[index]!));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    // ------------------------------------------------------------------- list
    if (LIST_PATTERN.test(line)) {
      const items: Array<{ text: string; depth: number }> = [];
      let ordered = false;
      while (index < lines.length) {
        const candidate = lines[index]!;
        const match = LIST_PATTERN.exec(candidate);
        if (match) {
          const depth = Math.min(3, Math.floor((match[1]!.replace(/\t/g, "  ").length) / 2));
          ordered = /\d/.test(match[2]!);
          items.push({ text: match[3]!.trim(), depth });
          index += 1;
          continue;
        }
        // Continuation lines of the previous item (indented, not a new bullet).
        if (candidate.trim() && /^\s{2,}/.test(candidate) && items.length > 0) {
          items[items.length - 1]!.text += ` ${candidate.trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // -------------------------------------------------------------- paragraph
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() &&
      !HEADING_PATTERN.test(lines[index]!) &&
      !/^```/.test(lines[index]!.trim()) &&
      !/^\s*>/.test(lines[index]!) &&
      !LIST_PATTERN.test(lines[index]!) &&
      !(lines[index]!.trim().startsWith("|") && isTableSeparator(lines[index + 1] ?? ""))
    ) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function defaultCalloutTitle(tone: string): string {
  switch (tone) {
    case "tip":
      return "Tip";
    case "warning":
      return "Perhatian";
    case "danger":
      return "Penting";
    default:
      return "Catatan";
  }
}

/** Headings used for the table of contents and the search index. */
export function extractHeadings(source: string): Array<{ id: string; text: string; level: 2 | 3 }> {
  return parseMarkdown(source)
    .filter((block): block is Extract<Block, { type: "heading" }> => block.type === "heading")
    .filter((block) => block.level === 2 || block.level === 3)
    .map((block) => ({ id: block.id, text: block.text, level: block.level as 2 | 3 }));
}
