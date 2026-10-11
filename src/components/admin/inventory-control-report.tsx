import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ExternalLink, Clock } from "lucide-react";
import type { SyncReport, ProductLine, PriceGap } from "@/lib/queries/inventory-control";
import type { AttentionItem } from "@/lib/queries/admin-inventory";
import { INVENTORY_ALERT_TYPE_LABELS, type InventoryAlertType } from "@/lib/enums";
import { formatPrice, formatDateTime } from "@/lib/format";

/**
 * What happened in the last sync, and what to do about it — in that order.
 *
 * The order is the whole design. Before this, /admin/inventory opened on a
 * filterable table of 2,200 products: a fine tool for looking something up
 * and no use at all for the question anyone actually arrives with, which is
 * "is the catalogue in order". For 35 days the answer was no, four tabs of
 * the price list were importing nothing, and every screen in the back
 * office looked completely normal.
 *
 * So faults first, then the price lists and their tabs with the dates they
 * were last read, then the work: what arrived, what needs content, where
 * the prices disagree, and what the supplier has dropped. Nothing here acts
 * on its own — the owner settles prices himself — and every section links
 * into the page that can actually do the work.
 */

const SOURCE_LABELS: Record<string, string> = {
  electronics: "מחירון מלאי אלקטרוניקה",
  "small-appliances": "מחירון ליין קטן",
  "white-goods-screens": "מחירון ליין לבן מסכים",
};

function timeAgo(date: Date | null) {
  if (!date) return "לא נקרא";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "הרגע";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

function Section({
  title,
  count,
  note,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  count?: number;
  note?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border mb-5 overflow-hidden rounded-xl border">
      <header className="bg-muted/50 border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
        <h2 className="text-base font-bold">{title}</h2>
        {count !== undefined && (
          <span className="bg-background border-border rounded-full border px-2 py-0.5 text-xs font-semibold">
            {count.toLocaleString("he-IL")}
          </span>
        )}
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
        {href && (
          <Link href={href} className="text-brand ms-auto text-xs font-bold hover:underline">
            {hrefLabel ?? "לכל הרשימה"} ←
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 px-4 py-6 text-sm">
      <CheckCircle2 className="text-success size-4 shrink-0" />
      {children}
    </p>
  );
}

function ProductRows({ rows, extra }: { rows: ProductLine[]; extra?: (p: ProductLine) => React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-border border-t">
            <td className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium">{p.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {p.brand && <span>{p.brand} · </span>}
                    מק״ט {p.sku}
                    {p.sheet && <span> · {p.sheet.trim()}</span>}
                    {p.images === 0 && <span className="text-destructive"> · אין תמונה</span>}
                  </p>
                </div>
                <Link
                  href={`/admin/products/${p.id}`}
                  className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                  aria-label="פתח את כרטיס המוצר"
                >
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
            </td>
            <td className="p-3 whitespace-nowrap">{p.price > 0 ? formatPrice(p.price) : "—"}</td>
            <td className="text-muted-foreground p-3 whitespace-nowrap">{p.stockQty} יח׳</td>
            {extra && <td className="p-3 text-xs whitespace-nowrap">{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InventoryControlReport({
  report,
  newInPriceList,
  attention,
  priceGaps,
  dropped,
}: {
  report: SyncReport;
  newInPriceList: ProductLine[];
  attention: AttentionItem[];
  priceGaps: PriceGap[];
  dropped: (ProductLine & { missingSince: Date })[];
}) {
  const { run, sources, sheets, faults } = report;
  /* A tab is called behind when it lags the newest read anywhere by more
     than a day. Measured against the whole catalogue and not against its own
     workbook, because a workbook whose every tab died at once lags itself by
     nothing — which is exactly how four switched-off sources sat unnoticed
     for 53 days. */
  const behind = sheets.filter((s) => s.lagDays > 1);

  return (
    <div className="mt-5">
      {/* 1 — anything wrong, before anything else. */}
      {faults.length > 0 ? (
        <Section
          title="תקלות פתוחות"
          count={faults.length}
          note="דורש טיפול"
          href="/admin/inventory/alerts"
        >
          <ul className="divide-border divide-y">
            {faults.map((f) => (
              <li key={f.id} className="flex items-start gap-3 px-4 py-3">
                <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {INVENTORY_ALERT_TYPE_LABELS[f.type as InventoryAlertType] ?? f.type}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-sm">{f.message}</p>
                </div>
                <span className="text-muted-foreground ms-auto shrink-0 text-xs">{timeAgo(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section title="תקלות פתוחות" count={0}>
          <Empty>אין תקלות פתוחות. כל המחירונים נקראים והלשוניות מתעדכנות.</Empty>
        </Section>
      )}

      {/* 2 — the price lists themselves, exposed. */}
      <Section
        title="המחירונים"
        note={
          run
            ? `הסנכרון האחרון ${timeAgo(run.startedAt)} · ${run.rowsScanned.toLocaleString("he-IL")} שורות נקראו`
            : "טרם רץ סנכרון"
        }
        href="/admin/inventory/history"
        hrefLabel="היסטוריית סנכרונים"
      >
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-border border-b">
              <th className="p-3 text-start font-semibold">מחירון</th>
              <th className="p-3 text-start font-semibold whitespace-nowrap">לשוניות</th>
              <th className="p-3 text-start font-semibold whitespace-nowrap">מוצרים</th>
              <th className="p-3 text-start font-semibold whitespace-nowrap">נקרא</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-border border-t">
                <td className="p-3">
                  <span className="flex items-center gap-2 font-medium">
                    <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" />
                    {SOURCE_LABELS[s.key] ?? s.key}
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap">{s.sheets}</td>
                <td className="p-3 whitespace-nowrap">{s.products.toLocaleString("he-IL")}</td>
                <td className="p-3 whitespace-nowrap">
                  {s.readAt ? formatDateTime(s.readAt) : <span className="text-destructive">לא נקרא</span>}
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={4} className="text-destructive p-4 text-sm">
                  אין אף מחירון פעיל מחובר.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {behind.length > 0 && (
          <div className="border-destructive/30 bg-destructive/5 border-t px-4 py-3">
            <p className="text-destructive flex items-center gap-2 text-sm font-bold">
              <Clock className="size-4" />
              {behind.length} לשוניות לא התעדכנו בסנכרון האחרון
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {behind.map((s) => (
                <li key={`${s.sourceKey}-${s.sheetName}`} className="text-muted-foreground">
                  <strong className="text-foreground">{s.sheetName.trim()}</strong> · {s.products} מוצרים
                  {s.live > 0 && <span className="text-destructive"> ({s.live} באתר)</span>} · פיגור{" "}
                  {s.lagDays > 900 ? "מעולם" : `${Math.floor(s.lagDays)} ימים`}
                  {!s.mapped && <span className="text-destructive"> · השם לא תקני</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 3 — what arrived and has to be made sellable. */}
      <Section
        title="מוצרים חדשים מהמחירון — צריך להעלות"
        count={newInPriceList.length}
        note="הגיעו מהמחירון עם שם גולמי, בלי תמונה ובלי תיאור"
        href="/admin/inventory/urgent"
      >
        {newInPriceList.length === 0 ? (
          <Empty>אין מוצרים חדשים שמחכים. כל מה שהגיע מהמחירון טופל.</Empty>
        ) : (
          <ProductRows rows={newInPriceList.slice(0, 12)} />
        )}
      </Section>

      {/* 4 — the attention queue, which already had its own page. */}
      <Section
        title="מוצרים שצריכים טיפול"
        count={attention.length}
        note="חסרה תמונה או מפרט — לא מופיעים באתר"
        href="/admin/inventory/urgent"
      >
        {attention.length === 0 ? (
          <Empty>אין מוצרים שממתינים לטיפול.</Empty>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {attention.slice(0, 12).map((item) => (
                <tr key={item.productId} className="border-border border-t">
                  <td className="p-3">
                    <p className="line-clamp-1 font-medium">{item.product.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">מק״ט {item.product.sku}</p>
                  </td>
                  {/* A product can hold more than one reason at once — the
                      sheet created it this morning AND it arrived with no
                      photograph — and getAttentionItems keeps them all. */}
                  <td className="p-3 text-xs whitespace-nowrap">
                    {item.types
                      .map((t) => INVENTORY_ALERT_TYPE_LABELS[t as InventoryAlertType] ?? t)
                      .join(" · ")}
                  </td>
                  <td className="p-3 text-end">
                    <Link
                      href={`/admin/products/${item.productId}`}
                      className="text-brand text-xs font-bold hover:underline"
                    >
                      פתח ←
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 5 — prices. Shown, never applied. */}
      <Section
        title="בעיות מחיר"
        count={priceGaps.length}
        note="המחירון אומר מחיר אחד והאתר מציג אחר · תצוגה בלבד, שינוי מחיר נעשה ידנית"
        href="/admin/prices"
        hrefLabel="מסך המחירים"
      >
        {priceGaps.length === 0 ? (
          <Empty>המחיר באתר תואם למחירון בכל המוצרים.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-border border-b">
                <th className="p-3 text-start font-semibold">מוצר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">באתר</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">במחירון</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">עלות</th>
                <th className="p-3 text-start font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {priceGaps.slice(0, 15).map((g) => (
                <tr
                  key={g.product.id}
                  className={`border-border border-t ${g.rowContradictsProduct ? "bg-destructive/5" : ""}`}
                >
                  <td className="p-3">
                    <p className="line-clamp-1 font-medium">{g.product.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      מק״ט {g.product.sku}
                      {g.product.sheet && <span> · {g.product.sheet.trim()}</span>}
                    </p>
                  </td>
                  <td className="p-3 font-semibold whitespace-nowrap">{formatPrice(g.product.price)}</td>
                  <td className="p-3 whitespace-nowrap">{formatPrice(g.sheetPrice)}</td>
                  <td className="text-muted-foreground p-3 whitespace-nowrap">
                    {g.product.supplierCost === null ? "—" : formatPrice(g.product.supplierCost)}
                  </td>
                  <td className="p-3 text-xs">
                    {g.rowContradictsProduct ? (
                      <span className="text-destructive font-bold">
                        השורה במחירון היא של מוצר אחר — לא לאמץ את המחיר
                      </span>
                    ) : g.belowCost ? (
                      <span className="text-destructive font-semibold">מתחת לעלות</span>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 6 — and what the supplier has dropped. */}
      <Section
        title="לא במחירון יותר"
        count={dropped.length}
        note="הוסרו מהאתר אוטומטית · למכור ממלאי קיים או להוציא מהקטלוג"
      >
        {dropped.length === 0 ? (
          <Empty>כל המוצרים בקטלוג נמצאים במחירון.</Empty>
        ) : (
          <ProductRows
            rows={dropped.slice(0, 12)}
            extra={(p) => {
              const row = dropped.find((d) => d.id === p.id);
              const days = row ? Math.floor((Date.now() - row.missingSince.getTime()) / 86_400_000) : 0;
              return <span className="text-muted-foreground">נעלם לפני {days} ימים</span>;
            }}
          />
        )}
      </Section>
    </div>
  );
}
