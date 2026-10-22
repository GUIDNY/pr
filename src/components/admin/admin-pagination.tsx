import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/**
 * Page numbers that fit on a phone.
 *
 * /admin/products listed every page in one row — 154 of them on
 * 22 October — and a 390px screen answered by laying the page out 2,800px
 * wide and zooming out until the text was unreadable. Here it is the first
 * page, the last, the current one with a neighbour either side, "…" where
 * pages are skipped, and a previous/next pair that a thumb can find.
 * The inventory page had already arrived at the same window on its own.
 */
export function pageWindow(page: number, totalPages: number, around = 1): number[] {
  const pages: number[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= around) pages.push(p);
  }
  return pages;
}

export function AdminPagination({
  page,
  totalPages,
  href,
  className = "mt-6",
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);
  return (
    <Pagination className={className}>
      <PaginationContent className="flex-wrap">
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={href(page - 1)} />
          </PaginationItem>
        )}
        {pages.map((p, idx) => (
          <PaginationItem key={p}>
            {idx > 0 && pages[idx - 1] !== p - 1 ? <PaginationEllipsis /> : null}
            <PaginationLink href={href(p)} isActive={p === page}>
              {p}
            </PaginationLink>
          </PaginationItem>
        ))}
        {page < totalPages && (
          <PaginationItem>
            <PaginationNext href={href(page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
