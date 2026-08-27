import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Calendar } from "lucide-react";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { getPublishedArticles } from "@/lib/queries/articles";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "מדריכי קנייה ומאמרים",
  description: "מדריכי קנייה, טיפים והשוואות למוצרי חשמל ואלקטרוניקה — איך לבחור נכון לפני שקונים.",
};

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">ראשי</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>מאמרים</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 mb-8 flex items-center gap-2.5">
        <BookOpen className="text-brand size-7" />
        <h1 className="text-2xl font-bold sm:text-3xl">מדריכי קנייה ומאמרים</h1>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground">אין עדיין מאמרים — חוזרים בקרוב.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/articles/${a.slug}`}
              className="border-border hover:border-brand/40 group flex flex-col overflow-hidden rounded-2xl border transition-colors"
            >
              <div className="bg-muted relative aspect-[16/10] overflow-hidden">
                {a.coverImageUrl ? (
                  <Image
                    src={a.coverImageUrl}
                    alt=""
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                ) : (
                  <div className="text-muted-foreground/40 flex size-full items-center justify-center">
                    <BookOpen className="size-10" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                {a.category && <span className="text-brand w-fit text-xs font-semibold">{a.category}</span>}
                <h2 className="group-hover:text-brand line-clamp-2 font-bold leading-snug transition-colors">{a.title}</h2>
                <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">{a.excerpt}</p>
                <span className="text-muted-foreground mt-auto flex items-center gap-1 pt-2 text-xs">
                  <Calendar className="size-3" /> {formatDate(a.publishedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
