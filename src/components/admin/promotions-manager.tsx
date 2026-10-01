"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Pencil, Plus, Search, Sparkles, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createPromotionAction,
  updatePromotionAction,
  togglePromotionAction,
  deletePromotionAction,
  searchProductsForPromotionAction,
  type PromotionInput,
} from "@/actions/admin-catalog";
import type { AdminPromotion, PromotionOptions } from "@/lib/queries/admin-promotions";
import { PROMOTION_SCOPE_LABELS, PROMOTION_TYPE_LABELS, type PromotionScope, type PromotionType } from "@/lib/enums";
import { formatPrice } from "@/lib/format";

/**
 * The coupon screen.
 *
 * One table, one dialog. The dialog creates and edits with the same form,
 * because a coupon is edited far more often than it is made — the end date
 * slips, the minimum changes, the code gets a typo — and two forms drift.
 *
 * Everything the form sends is validated again on the server
 * (promotionSchema in admin-catalog.ts); what this file validates is only
 * what helps the person typing.
 */

type FormState = {
  name: string;
  code: string;
  description: string;
  type: PromotionType;
  value: string;
  scope: PromotionScope;
  scopeRefId: string;
  scopeRefName: string;
  minCartAmount: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  firstOrderOnly: boolean;
  membersOnly: boolean;
  isActive: boolean;
};

const EMPTY: FormState = {
  name: "",
  code: "",
  description: "",
  type: "PERCENTAGE",
  value: "",
  scope: "CART",
  scopeRefId: "",
  scopeRefName: "",
  minCartAmount: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perCustomerLimit: "",
  firstOrderOnly: false,
  membersOnly: false,
  isActive: true,
};

/* No 0/O, 1/I: a code is read out over the phone and typed on a bus. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** ISO → the value a datetime-local input wants, in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromPromotion(p: AdminPromotion): FormState {
  return {
    name: p.name,
    code: p.code ?? "",
    description: p.description ?? "",
    type: p.type as PromotionType,
    value: p.type === "FREE_DELIVERY" ? "" : String(p.value),
    scope: p.scope as PromotionScope,
    scopeRefId: p.scopeRefId ?? "",
    scopeRefName: p.scopeRefName ?? "",
    minCartAmount: p.minCartAmount ? String(p.minCartAmount) : "",
    maxDiscount: p.maxDiscount ? String(p.maxDiscount) : "",
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
    usageLimit: p.usageLimit ? String(p.usageLimit) : "",
    perCustomerLimit: p.perCustomerLimit ? String(p.perCustomerLimit) : "",
    firstOrderOnly: p.firstOrderOnly,
    membersOnly: p.membersOnly,
    isActive: p.isActive,
  };
}

function toInput(f: FormState): PromotionInput {
  return {
    name: f.name,
    code: f.code,
    description: f.description,
    type: f.type,
    value: f.type === "FREE_DELIVERY" ? 0 : Number(f.value),
    scope: f.scope,
    scopeRefId: f.scopeRefId,
    minCartAmount: f.minCartAmount ? Number(f.minCartAmount) : null,
    maxDiscount: f.maxDiscount ? Number(f.maxDiscount) : null,
    startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
    endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
    usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
    perCustomerLimit: f.perCustomerLimit ? Number(f.perCustomerLimit) : null,
    firstOrderOnly: f.firstOrderOnly,
    membersOnly: f.membersOnly,
    isActive: f.isActive,
  };
}

type Status = { key: "off" | "scheduled" | "expired" | "exhausted" | "live"; label: string; className: string };

function statusOf(p: AdminPromotion, now: number): Status {
  if (!p.isActive) return { key: "off", label: "כבוי", className: "bg-muted text-muted-foreground" };
  if (p.startsAt && new Date(p.startsAt).getTime() > now)
    return { key: "scheduled", label: "מתוכנן", className: "bg-sky-100 text-sky-800" };
  if (p.endsAt && new Date(p.endsAt).getTime() < now)
    return { key: "expired", label: "פג תוקף", className: "bg-amber-100 text-amber-800" };
  if (p.usageLimit && p.used >= p.usageLimit)
    return { key: "exhausted", label: "נוצל במלואו", className: "bg-amber-100 text-amber-800" };
  return { key: "live", label: "פעיל", className: "bg-success/15 text-success" };
}

function discountText(p: { type: string; value: number; maxDiscount: number | null }): string {
  if (p.type === "FREE_DELIVERY") return "משלוח חינם";
  if (p.type === "PERCENTAGE") return `${p.value}%${p.maxDiscount ? ` (עד ${formatPrice(p.maxDiscount)})` : ""}`;
  return formatPrice(p.value);
}

function conditionsText(p: AdminPromotion): string {
  const parts: string[] = [];
  if (p.minCartAmount) parts.push(`מעל ${formatPrice(p.minCartAmount)}`);
  if (p.startsAt) parts.push(`מ‑${new Date(p.startsAt).toLocaleDateString("he-IL")}`);
  if (p.endsAt) parts.push(`עד ${new Date(p.endsAt).toLocaleDateString("he-IL")}`);
  if (p.firstOrderOnly) parts.push("הזמנה ראשונה");
  if (p.membersOnly) parts.push("לרשומים בלבד");
  if (p.perCustomerLimit) parts.push(p.perCustomerLimit === 1 ? "פעם אחת ללקוח" : `${p.perCustomerLimit} ללקוח`);
  return parts.join(" · ") || "—";
}

export function PromotionsManager({
  initial,
  personalCount,
  options,
}: {
  initial: AdminPromotion[];
  personalCount: number;
  options: PromotionOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPromotion | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  /* Read once per mount rather than on every render: a status that flips
     mid-render is what the purity rule guards against, and a page that is
     open for an hour is refreshed by the next action anyway. */
  const [now] = useState(() => Date.now());

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, code: randomCode() });
    setOpen(true);
  }

  function openEdit(p: AdminPromotion) {
    setEditing(p);
    setForm(fromPromotion(p));
    setOpen(true);
  }

  function submit() {
    startTransition(async () => {
      const input = toInput(form);
      const result = editing ? await updatePromotionAction(editing.id, input) : await createPromotionAction(input);
      if (!result.success) {
        toast.error(result.error ?? "השמירה נכשלה");
        return;
      }
      toast.success(editing ? "הקופון עודכן" : "הקופון נוצר");
      setOpen(false);
      router.refresh();
    });
  }

  function toggle(id: string, next: boolean) {
    startTransition(async () => {
      await togglePromotionAction(id, next);
      router.refresh();
    });
  }

  function remove(p: AdminPromotion) {
    if (!window.confirm(`למחוק את הקופון "${p.name}"${p.code ? ` (${p.code})` : ""}? הזמנות שכבר השתמשו בו לא ישתנו.`)) return;
    startTransition(async () => {
      await deletePromotionAction(p.id);
      toast.success("הקופון נמחק");
      router.refresh();
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">קופונים והנחות</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            קוד שהלקוח מקליד בעגלה. בלי קוד, זו הנחה אוטומטית לכל העגלה.
            {personalCount > 0 && ` · ${personalCount} קופונים אישיים של המועדון לא מוצגים כאן.`}
          </p>
        </div>
        <Button variant="brand" size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="size-4" /> קופון חדש
        </Button>
      </div>

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>קוד</TableHead>
              <TableHead>שם</TableHead>
              <TableHead>הנחה</TableHead>
              <TableHead>חל על</TableHead>
              <TableHead>תנאים</TableHead>
              <TableHead>שימוש</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-10 text-center">
                  <Tag className="mx-auto mb-2 size-8 opacity-40" />
                  אין קופונים עדיין. לחצו ״קופון חדש״.
                </TableCell>
              </TableRow>
            ) : (
              initial.map((p) => {
                const status = statusOf(p, now);
                return (
                  <TableRow key={p.id} className={status.key === "live" ? "" : "opacity-70"}>
                    <TableCell>
                      {p.code ? (
                        <button
                          type="button"
                          onClick={() => copy(p.code!)}
                          className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm font-bold"
                          title="העתקה"
                          dir="ltr"
                        >
                          {p.code}
                          {copied === p.code ? <Check className="text-success size-3.5" /> : <Copy className="text-muted-foreground size-3.5" />}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">אוטומטי</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-muted-foreground text-xs">{p.description}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{discountText(p)}</TableCell>
                    <TableCell>
                      {PROMOTION_SCOPE_LABELS[p.scope as PromotionScope] ?? p.scope}
                      {p.scopeRefName && <div className="text-muted-foreground text-xs">{p.scopeRefName}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-56 text-xs">{conditionsText(p)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {p.code ? (
                        <>
                          {p.used}
                          {p.usageLimit ? ` / ${p.usageLimit}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Switch checked={p.isActive} onCheckedChange={(v) => toggle(p.id, v)} disabled={isPending} aria-label="פעיל" />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="עריכה">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(p)} aria-label="מחיקה" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת קופון" : "קופון חדש"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">שם (פנימי)</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="קופון חורף 10%" autoFocus />
              </div>
              <div>
                <Label className="mb-1.5">קוד שהלקוח מקליד</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={form.code}
                    onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s+/g, ""))}
                    dir="ltr"
                    className="font-mono"
                    placeholder="ריק = הנחה אוטומטית"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => set("code", randomCode())} title="קוד אקראי">
                    <Sparkles className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1.5">מה הלקוח רואה כשהקוד נקלט</Label>
              <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="10% הנחה על כל המקררים" maxLength={120} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5">סוג</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as PromotionType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{PROMOTION_TYPE_LABELS[form.type]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {PROMOTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.type !== "FREE_DELIVERY" && (
                <div>
                  <Label className="mb-1.5">{form.type === "PERCENTAGE" ? "אחוז" : "סכום בש״ח"}</Label>
                  <Input type="number" min={0} max={form.type === "PERCENTAGE" ? 100 : undefined} value={form.value} onChange={(e) => set("value", e.target.value)} />
                </div>
              )}
              {form.type === "PERCENTAGE" && (
                <div>
                  <Label className="mb-1.5">תקרת הנחה בש״ח (אופציונלי)</Label>
                  <Input type="number" min={0} value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} placeholder="ללא" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">חל על</Label>
                <Select
                  value={form.scope}
                  onValueChange={(v) => setForm((f) => ({ ...f, scope: v as PromotionScope, scopeRefId: "", scopeRefName: "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{PROMOTION_SCOPE_LABELS[form.scope]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROMOTION_SCOPE_LABELS) as PromotionScope[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {PROMOTION_SCOPE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ScopePicker form={form} options={options} onPick={(id, name) => setForm((f) => ({ ...f, scopeRefId: id, scopeRefName: name }))} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5">מינימום לעגלה (ש״ח)</Label>
                <Input type="number" min={0} value={form.minCartAmount} onChange={(e) => set("minCartAmount", e.target.value)} placeholder="ללא" />
              </div>
              <div>
                <Label className="mb-1.5">מתחיל</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} dir="ltr" />
              </div>
              <div>
                <Label className="mb-1.5">מסתיים</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} dir="ltr" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">מספר שימושים כולל</Label>
                <Input type="number" min={1} value={form.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} placeholder="ללא הגבלה" />
              </div>
              <div>
                <Label className="mb-1.5">שימושים לכל לקוח</Label>
                <Input type="number" min={1} value={form.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} placeholder="ללא הגבלה" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={form.firstOrderOnly} onCheckedChange={(v) => set("firstOrderOnly", v === true)} />
                להזמנה ראשונה בלבד (לקוח בלי הזמנה ששולמה)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={form.membersOnly} onCheckedChange={(v) => set("membersOnly", v === true)} />
                ללקוחות רשומים בלבד (אורח יתבקש להתחבר)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                {form.isActive ? "פעיל" : "כבוי — הקוד לא יתקבל"}
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="brand" onClick={submit} disabled={isPending}>
              {isPending ? "שומר…" : editing ? "שמירה" : "יצירת קופון"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The second half of "חל על": which category, which brand, which product. */
function ScopePicker({
  form,
  options,
  onPick,
}: {
  form: FormState;
  options: PromotionOptions;
  onPick: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; sku: string; price: number }[]>([]);
  const [searching, startSearch] = useTransition();

  const categoryLabel = useMemo(() => {
    const c = options.categories.find((x) => x.id === form.scopeRefId);
    return c ? (c.parentName ? `${c.parentName} › ${c.name}` : c.name) : "";
  }, [form.scopeRefId, options.categories]);

  /* Debounced search. Clearing the list lives in the input handler below,
     not here: an effect that calls setState on what it just observed is a
     render loop waiting to be tripped. */
  useEffect(() => {
    if (form.scope !== "PRODUCT" || query.trim().length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchProductsForPromotionAction(query));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, form.scope]);

  if (form.scope === "CART") {
    return (
      <div>
        <Label className="mb-1.5">&nbsp;</Label>
        <p className="text-muted-foreground pt-2 text-xs">ההנחה מחושבת על כל העגלה.</p>
      </div>
    );
  }

  if (form.scope === "CATEGORY") {
    return (
      <div>
        <Label className="mb-1.5">קטגוריה</Label>
        <Select value={form.scopeRefId} onValueChange={(id) => onPick(id, options.categories.find((c) => c.id === id)?.name ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="בחירת קטגוריה">{categoryLabel || undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.parentName ? `${c.parentName} › ${c.name}` : c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">מחלקה שלמה תופסת גם את כל תת‑הקטגוריות שלה.</p>
      </div>
    );
  }

  if (form.scope === "BRAND") {
    return (
      <div>
        <Label className="mb-1.5">מותג</Label>
        <Select value={form.scopeRefId} onValueChange={(id) => onPick(id, options.brands.find((b) => b.id === id)?.name ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="בחירת מותג">{options.brands.find((b) => b.id === form.scopeRefId)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div>
      <Label className="mb-1.5">מוצר</Label>
      {form.scopeRefId ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <span className="truncate">{form.scopeRefName}</span>
          <button type="button" className="text-muted-foreground text-xs underline" onClick={() => onPick("", "")}>
            החלפה
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder="חיפוש לפי שם או מק״ט"
            className="pr-8"
          />
          {(results.length > 0 || searching) && (
            <ul className="bg-popover absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border shadow-md">
              {searching && results.length === 0 && <li className="text-muted-foreground px-3 py-2 text-xs">מחפש…</li>}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm"
                    onClick={() => {
                      onPick(r.id, `${r.title} (${r.sku})`);
                      setQuery("");
                    }}
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs" dir="ltr">
                      {r.sku} · {formatPrice(r.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
