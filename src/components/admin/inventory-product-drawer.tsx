"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Pencil, RefreshCw, EyeOff, Eye, Package } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StockBadge } from "@/components/product/stock-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getInventoryDrawerDataAction,
  resyncSingleProductAction,
  toggleProductPublishAction,
} from "@/actions/admin-inventory";
import { formatPrice, formatDateTime } from "@/lib/format";
import {
  ENRICHMENT_STATUS_LABELS,
  INVENTORY_CHANGE_TYPE_LABELS,
  type StockStatus,
  type EnrichmentStatus,
  type InventoryChangeType,
} from "@/lib/enums";

type DrawerProduct = NonNullable<Awaited<ReturnType<typeof getInventoryDrawerDataAction>>>;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

export function InventoryProductDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product");
  const open = Boolean(productId);

  const [product, setProduct] = useState<DrawerProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getInventoryDrawerDataAction(productId).then((data) => {
      if (!cancelled) {
        setProduct(data as DrawerProduct | null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  function handlePublishToggle() {
    if (!product) return;
    startTransition(async () => {
      await toggleProductPublishAction(product.id, !product.isPublished);
      setProduct({ ...product, isPublished: !product.isPublished });
      toast.success(product.isPublished ? "המוצר הוסתר מהאתר" : "המוצר פורסם באתר");
      router.refresh();
    });
  }

  function handleResync() {
    if (!product) return;
    startTransition(async () => {
      const result = await resyncSingleProductAction(product.id);
      if (result.success) toast.success("הסנכרון הושלם");
      else toast.error(result.error ?? "הסנכרון נכשל");
      const fresh = await getInventoryDrawerDataAction(product.id);
      setProduct(fresh as DrawerProduct | null);
      router.refresh();
    });
  }

  let stockBreakdown: Record<string, unknown> = {};
  try {
    stockBreakdown = product?.stockBreakdown ? JSON.parse(product.stockBreakdown) : {};
  } catch {
    stockBreakdown = {};
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !product ? (
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="gap-3 border-b pb-4">
              <div className="flex items-start gap-3">
                <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
                  {product.images[0] ? (
                    <Image src={product.images[0].url} alt="" fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="text-muted-foreground flex size-full items-center justify-center">
                      <Package className="size-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="line-clamp-2 text-base leading-snug">{product.title}</SheetTitle>
                  <p className="text-muted-foreground mt-1 text-xs" dir="ltr">
                    {product.sku}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StockBadge status={product.stockStatus as StockStatus} />
                    <span
                      className={
                        product.isPublished
                          ? "bg-success/15 text-success rounded-full px-2 py-0.5 text-xs font-medium"
                          : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium"
                      }
                    >
                      {product.isPublished ? "מפורסם" : "לא מפורסם"}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-4">
              {product.alerts.length > 0 && (
                <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-3">
                  <h3 className="text-destructive mb-1.5 text-xs font-semibold">
                    {product.alerts.length} בעיות פתוחות
                  </h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {product.alerts.map((a) => (
                      <li key={a.id}>⚠ {a.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <section>
                <h3 className="mb-2.5 text-sm font-semibold">מלאי ומחיר</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="מחיר מכירה" value={formatPrice(product.price)} />
                  <Field label="מחיר מינימום" value={product.minSalePrice ? formatPrice(product.minSalePrice) : "—"} />
                  <Field label="מלאי כולל" value={product.stockQty} />
                  <Field label="מותג" value={product.brand.name} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Field label="יתרה" value={product.sellableStock ?? "—"} />
                  <Field label="מחסן" value={product.warehouseStock ?? "—"} />
                  <Field label="תצוגה" value={product.showroomStock ?? "—"} />
                  <Field label="ספק" value={product.supplierStock ?? "—"} />
                  <Field label="בונדד" value={product.bondedStock ?? "—"} />
                </div>
              </section>

              <Separator />

              <section>
                <h3 className="mb-2.5 text-sm font-semibold">מקור נתונים</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="מקור" value={product.source?.filename} />
                  <Field label="גיליון" value={product.sourceSheet} />
                  <Field label="שורה" value={product.sourceRowRef} />
                  <Field label="סונכרן לאחרונה" value={product.lastExcelSyncAt ? formatDateTime(product.lastExcelSyncAt) : "—"} />
                </div>
                {Object.keys(stockBreakdown).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
                      נתוני מקור גולמיים
                    </summary>
                    <div className="border-border mt-2 max-h-48 overflow-auto rounded-lg border p-2.5 text-xs">
                      {Object.entries(stockBreakdown).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 py-1">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="text-end">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2.5 text-sm font-semibold">נתוני אתר</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="קטגוריה" value={product.category.name} />
                  <Field label="תמונות" value={`${product.images.length}`} />
                  <Field
                    label="סטטוס העשרה"
                    value={ENRICHMENT_STATUS_LABELS[product.enrichmentStatus as EnrichmentStatus] ?? product.enrichmentStatus}
                  />
                </div>
              </section>

              {product.changeEvents.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="mb-2.5 text-sm font-semibold">היסטוריית שינויים</h3>
                    <ul className="flex flex-col gap-2">
                      {product.changeEvents.slice(0, 8).map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                            {INVENTORY_CHANGE_TYPE_LABELS[e.changeType as InventoryChangeType] ?? e.changeType}
                          </span>
                          <span className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              <Separator />

              <section className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href={`/admin/products/${product.id}`}>
                      <Pencil className="size-3.5" /> ערוך מוצר
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href={`/product/${product.slug}`} target="_blank">
                      <ExternalLink className="size-3.5" /> פתח באתר
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResync} disabled={isPending} className="gap-1.5">
                    <RefreshCw className={isPending ? "size-3.5 animate-spin" : "size-3.5"} /> סנכרן מחדש
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePublishToggle} disabled={isPending} className="gap-1.5">
                    {product.isPublished ? (
                      <>
                        <EyeOff className="size-3.5" /> הסתר מהאתר
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" /> פרסם באתר
                      </>
                    )}
                  </Button>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
