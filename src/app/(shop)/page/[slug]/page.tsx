import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCmsPage } from "@/lib/queries/content";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  return { title: page?.title };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
      <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{page.body}</div>
    </div>
  );
}
