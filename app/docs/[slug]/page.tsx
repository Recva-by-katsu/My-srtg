import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOC_PAGES, getDocPage } from "@/docs/registry";
import { DocArticle } from "@/components/docs/doc-article";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return { title: "Dokumentasi tidak ditemukan" };
  return { title: page.title, description: page.description };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();
  return <DocArticle page={page} />;
}
