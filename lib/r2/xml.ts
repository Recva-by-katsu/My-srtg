/**
 * Minimal dependency-free XML reader/writer.
 *
 * The S3 API (and therefore Cloudflare R2) speaks XML. We only need to read a
 * handful of simple documents (ListBucketResult, CompleteMultipartUploadResult,
 * ListPartsResult, Error) so a small purpose built parser keeps the bundle tiny
 * and works identically in Node.js and workerd.
 */

export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

export function parseXml(input: string): XmlNode {
  const root: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tagPattern = /<(\/)?([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/)?>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(input)) !== null) {
    const [raw, closing, rawName, rawAttributes, selfClosing] = match as unknown as [
      string,
      string | undefined,
      string,
      string,
      string | undefined,
    ];
    const textBefore = input.slice(cursor, match.index);
    const stripped = stripCdata(textBefore);
    if (stripped.trim()) {
      const current = stack[stack.length - 1]!;
      current.text += decodeEntities(stripped.trim());
    }
    cursor = match.index + raw.length;

    if (input.startsWith("<?", match.index) || raw.startsWith("<!")) continue;

    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const node: XmlNode = {
      name: rawName!,
      attributes: parseAttributes(rawAttributes ?? ""),
      children: [],
      text: "",
    };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

function stripCdata(input: string): string {
  return input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1];
    if (!key) continue;
    attributes[key] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

/** Returns the first direct/descendant child with the given tag name. */
export function find(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const child of node.children) {
    if (child.name === name) return child;
  }
  for (const child of node.children) {
    const nested = find(child, name);
    if (nested) return nested;
  }
  return undefined;
}

export function findAll(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  const found: XmlNode[] = [];
  for (const child of node.children) {
    if (child.name === name) found.push(child);
    else found.push(...findAll(child, name));
  }
  return found;
}

export function textOf(node: XmlNode | undefined, name: string): string {
  return find(node, name)?.text.trim() ?? "";
}

export function numberOr(node: XmlNode | undefined, name: string, fallback = 0): number {
  const raw = textOf(node, name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanOr(node: XmlNode | undefined, name: string, fallback = false): boolean {
  const raw = textOf(node, name).toLowerCase();
  if (!raw) return fallback;
  return raw === "true";
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Convenience helper for the small documents we have to send (CompleteMultipartUpload, Delete). */
export function buildXml(rootName: string, children: Array<string | [string, string]>): string {
  const body = children
    .map((child) => {
      if (typeof child === "string") return child;
      const [name, value] = child;
      return `<${name}>${escapeXml(value)}</${name}>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>${body}</${rootName}>`;
}
