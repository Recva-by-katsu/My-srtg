import Link from "next/link";
import type { ReactNode } from "react";
import { parseInline, parseMarkdown, type Block, type InlineNode } from "@/docs/markdown";
import { CodeBlock } from "@/components/docs/code-block";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";

function isInternal(href?: string): boolean {
  if (!href) return false;
  return href.startsWith("/") && !href.startsWith("//");
}

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "code":
        return (
          <code
            key={key}
            className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-brand-200 ring-1 ring-inset ring-white/10"
          >
            {node.text}
          </code>
        );
      case "bold":
        return (
          <strong key={key} className="font-semibold text-white">
            {node.text}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic text-slate-200">
            {node.text}
          </em>
        );
      case "link":
        if (isInternal(node.href)) {
          return (
            <Link
              key={key}
              href={node.href!}
              className="font-medium text-brand-300 underline decoration-brand-400/30 underline-offset-4 transition-colors hover:text-brand-200 hover:decoration-brand-300"
            >
              {node.text}
            </Link>
          );
        }
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-brand-300 underline decoration-brand-400/30 underline-offset-4 transition-colors hover:text-brand-200 hover:decoration-brand-300"
          >
            {node.text}
          </a>
        );
      default:
        return <span key={key}>{node.text}</span>;
    }
  });
}

function renderList(items: Array<{ text: string; depth: number }>, ordered: boolean, keyPrefix: string): ReactNode {
  // Builds a nested tree from the flat (text, depth) list produced by the parser.
  interface Node {
    text?: string;
    children: Node[];
  }
  const root: Node = { children: [] };
  const stack: Array<{ node: Node; depth: number }> = [{ node: root, depth: -1 }];

  for (const item of items) {
    const node: Node = { text: item.text, children: [] };
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= item.depth) stack.pop();
    stack[stack.length - 1]!.node.children.push(node);
    stack.push({ node, depth: item.depth });
  }

  const renderNode = (node: Node, depth: number): ReactNode => {
    const ListTag = ordered ? "ol" : "ul";
    return (
      <ListTag
        className={cn(
          "space-y-2",
          depth === 0 ? "my-4 list-none space-y-2.5 pl-0" : "mt-2 list-disc space-y-1.5 pl-5 marker:text-brand-400",
        )}
      >
        {node.children.map((child, index) => (
          <li key={`${keyPrefix}-${depth}-${index}`} className="relative text-[14.5px] leading-7 text-slate-300">
            {depth === 0 ? (
              <span className="absolute -left-0 top-[0.7rem] hidden h-1.5 w-1.5 -translate-x-4 rounded-full bg-brand-400/70 sm:block" />
            ) : null}
            {child.text ? <>{renderInline(parseInline(child.text), `${keyPrefix}-${depth}-${index}`)}</> : null}
            {child.children.length > 0 ? renderNode(child, depth + 1) : null}
          </li>
        ))}
      </ListTag>
    );
  };

  return renderNode(root, 0);
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `block-${index}`;

  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}` as unknown) as "h1" | "h2" | "h3" | "h4";
      const styles: Record<number, string> = {
        1: "mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl",
        2: "mt-12 scroll-mt-28 border-b border-white/8 pb-2.5 text-[22px] font-semibold tracking-tight text-white",
        3: "mt-8 scroll-mt-28 text-[17px] font-semibold tracking-tight text-slate-100",
        4: "mt-6 scroll-mt-28 text-[15px] font-semibold tracking-tight text-slate-200",
      };
      return (
        <Tag key={key} id={block.id} className={styles[block.level]}>
          <a href={`#${block.id}`} className="group relative no-underline">
            <span className="absolute -left-5 hidden text-brand-400/60 opacity-0 transition-opacity group-hover:opacity-100 lg:inline">
              #
            </span>
            {renderInline(parseInline(block.text), key)}
          </a>
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p key={key} className="my-4 text-[14.5px] leading-7 text-slate-300">
          {renderInline(parseInline(block.text), key)}
        </p>
      );

    case "list":
      return <div key={key}>{renderList(block.items, block.ordered, key)}</div>;

    case "code":
      return <CodeBlock key={key} code={block.code} lang={block.lang} />;

    case "quote":
      return (
        <blockquote
          key={key}
          className="my-5 rounded-r-xl border-l-2 border-brand-400/50 bg-white/[0.03] py-3 pl-4 pr-4 text-[14px] italic leading-7 text-slate-300"
        >
          {renderInline(parseInline(block.text.replace(/\n/g, " ")), key)}
        </blockquote>
      );

    case "callout": {
      const tone =
        block.tone === "tip" ? "success" : block.tone === "warning" ? "warning" : block.tone === "danger" ? "danger" : "info";
      return (
        <div key={key} className="my-5">
          <Alert tone={tone} title={block.title}>
            {block.text
              ? block.text.split("\n").map((line, lineIndex) => (
                  <p key={`${key}-${lineIndex}`} className={lineIndex > 0 ? "mt-1.5" : undefined}>
                    {renderInline(parseInline(line), `${key}-${lineIndex}`)}
                  </p>
                ))
              : null}
          </Alert>
        </div>
      );
    }

    case "table":
      return (
        <div key={key} className="scrollbar-thin my-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                {block.head.map((cell, cellIndex) => (
                  <th key={`${key}-h-${cellIndex}`} className="whitespace-nowrap border-b border-white/10 px-4 py-2.5 font-semibold">
                    {renderInline(parseInline(cell), `${key}-h-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`} className="odd:bg-white/[0.015]">
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-r-${rowIndex}-c-${cellIndex}`} className="border-b border-white/5 px-4 py-2.5 align-top text-slate-300 last:border-0">
                      {renderInline(parseInline(cell), `${key}-r-${rowIndex}-c-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr key={key} className="my-10 border-white/8" />;

    default:
      return null;
  }
}

export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="max-w-none">{blocks.map(renderBlock)}</div>;
}
