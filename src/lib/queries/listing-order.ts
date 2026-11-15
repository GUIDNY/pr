/**
 * The order of a paged listing — a category page or a brand page.
 *
 * Every sort here used to be a single key, and the default one was
 * `isBestSeller desc`. No product is marked a best seller (see
 * getNewArrivals in products.ts), so the default listing had no order at
 * all: every row tied, and the database was free to return them in
 * whatever order the table happened to hold them — an order that moves
 * each time a row is rewritten, which the sync does to every product
 * twice a day.
 *
 * With one page that is harmless. With `skip` and `take` it is not: each
 * page is a separate query, and two queries over an order that is not
 * defined do not have to agree where one page ends and the next begins.
 * Measured on the live site on 15 November by walking every page of
 * /category/fridge-4-door: 139 live products, 139 cards across five pages,
 * **134 different products** — five shown on two pages and five shown on
 * none. A product on no page of its category has no link from it, to a
 * shopper or to a crawler. Search Console that morning listed 884 product
 * pages it knew only from the sitemap, with "referring page: none".
 * /category/range-hoods, walked the same minute, was complete — which is
 * what an undefined order looks like: right until it is not.
 *
 * So every sort ends on `id`, which is unique, and no two rows can tie.
 * Price and rating need it as much as the default does: forty ovens at
 * 3,990 ₪ are forty rows the price sort alone cannot place.
 *
 * The default also gets a real second key. With nothing marked a best
 * seller, "newest first" is the order it falls back to — the same one the
 * homepage's new-arrivals rail uses, and the one that puts a product on
 * page 1 of its category on the day it arrives. If products are ever
 * marked best sellers they still come first, as before.
 */
export type ListingSort = "relevance" | "price-asc" | "price-desc" | "newest" | "rating";

type Direction = "asc" | "desc";
export type ListingOrder = Array<Partial<Record<"isBestSeller" | "price" | "createdAt" | "ratingAvg" | "id", Direction>>>;

export function listingOrderBy(sort: ListingSort | undefined): ListingOrder {
  const tieBreak: ListingOrder = [{ id: "asc" }];
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" }, ...tieBreak];
    case "price-desc":
      return [{ price: "desc" }, ...tieBreak];
    case "newest":
      return [{ createdAt: "desc" }, ...tieBreak];
    case "rating":
      return [{ ratingAvg: "desc" }, ...tieBreak];
    default:
      return [{ isBestSeller: "desc" }, { createdAt: "desc" }, ...tieBreak];
  }
}
