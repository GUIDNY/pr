import type { Metadata } from "next";
import { ProductPageView } from "@/components/product/product-page-view";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";

// The same product page, for someone who is signed in.
//
// It exists only so that /product/[slug] does not have to read a session.
// Reading one makes a route dynamic — Next serves it `private, no-store` and
// no CDN will hold it — and that single call was what kept 1,429 product
// pages being rendered in Sydney for every crawler that asked.
//
// Nobody links here and nobody types it: proxy.ts rewrites a signed-in
// browser's request for /product/x to this route, so the address bar still
// says /product/x. A visitor who reaches the path directly is bounced to the
// real one.
export const dynamic = "force-dynamic";

// Belt and braces. The path is unreachable by rewrite alone and carries the
// same content as the public page, but a duplicate that Google can reach is
// a duplicate Google will judge, so it is never indexable.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProductAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const isAdminViewer = canManageCatalog(session?.role);

  // A signed-in customer, or anyone holding a cookie that is no longer a
  // valid session, is rewritten here too — the proxy can only see that a
  // cookie exists, not what is in it. They get exactly the public page. Not a
  // redirect back to it: that would be a second round trip to show them the
  // same thing, and this page can simply render it.
  return <ProductPageView slug={slug} isAdminViewer={isAdminViewer} />;
}
