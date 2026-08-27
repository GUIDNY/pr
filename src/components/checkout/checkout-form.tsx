"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CreditCard, Home, ShieldCheck, Truck, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { useCartStore } from "@/stores/cart-store";
import { createOrderAction } from "@/actions/orders";
import { formatPrice } from "@/lib/format";
import type { CheckoutInput } from "@/lib/order-schema";
import { displayBrandName } from "@/lib/brand-display";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ISRAELI_CITY_SUGGESTIONS,
  formatCardExpiry,
  formatCardNumber,
  validateCardCvv,
  validateCardExpiry,
  validateCardNumber,
  validateEmail,
  validateFullName,
  validatePhone,
} from "@/lib/checkout-validation";

export function CheckoutForm({
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
}) {
  const cart = useCartStore((s) => s.cart);
  const setCart = useCartStore((s) => s.setCart);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: defaultName ?? "",
    email: defaultEmail ?? "",
    phone: defaultPhone ?? "",
    deliveryMethod: "DELIVERY" as "DELIVERY" | "PICKUP",
    city: "",
    street: "",
    houseNo: "",
    apartment: "",
    deliveryNotes: "",
    paymentMethod: "DEMO_CARD" as "DEMO_CARD" | "CASH_ON_DELIVERY",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
  });
  // Consent to the terms is recorded as an explicit act by the customer, and
  // the order cannot be placed without it — a checkout that takes payment
  // with no acknowledgement of the terms has no evidence one was ever given.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error the moment it's edited. Leaving a stale message
    // under a field the customer has just corrected reads as the correction
    // not having worked.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  }

  // Run as each field is left, so a typo is caught next to where it was made
  // rather than as one toast after the whole form is filled in.
  function validateField(key: string) {
    const check: Record<string, () => string | null> = {
      fullName: () => validateFullName(form.fullName),
      email: () => validateEmail(form.email),
      phone: () => validatePhone(form.phone),
      cardNumber: () => (form.paymentMethod === "DEMO_CARD" ? validateCardNumber(form.cardNumber) : null),
      cardExpiry: () => (form.paymentMethod === "DEMO_CARD" ? validateCardExpiry(form.cardExpiry) : null),
      cardCvv: () => (form.paymentMethod === "DEMO_CARD" ? validateCardCvv(form.cardCvv) : null),
    };
    const error = check[key]?.() ?? null;
    setErrors((prev) => ({ ...prev, [key]: error ?? "" }));
    return !error;
  }

  function submit() {
    const fields = ["fullName", "email", "phone"];
    if (form.paymentMethod === "DEMO_CARD") fields.push("cardNumber", "cardExpiry", "cardCvv");
    // Every field, not the first failure — one pass over the form beats
    // discovering the next problem after fixing this one.
    const allValid = fields.map(validateField).every(Boolean);
    if (!allValid) {
      toast.error("יש לתקן את השדות המסומנים");
      return;
    }
    if (!acceptedTerms) {
      toast.error("יש לאשר את תקנון האתר כדי להשלים את ההזמנה");
      return;
    }
    startTransition(async () => {
      const result = await createOrderAction(form as CheckoutInput);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בביצוע ההזמנה");
        return;
      }
      setCart({ ...cart, items: [], itemCount: 0, subtotal: 0, discount: 0, deliveryFee: 0, total: 0, couponCode: null });
      router.push(`/checkout/success/${result.orderNumber}`);
    });
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="text-xl font-bold">אין פריטים בעגלה</h1>
        <p className="text-muted-foreground text-sm">יש להוסיף מוצרים לעגלה לפני ביצוע הזמנה.</p>
        <Button variant="brand" asChild>
          <Link href="/">חזרה לחנות</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">תשלום</h1>

        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">1. פרטי התקשרות</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName" className="mb-1.5">שם מלא</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                onBlur={() => validateField("fullName")}
                aria-invalid={!!errors.fullName}
                required
              />
              {errors.fullName && <p className="text-destructive mt-1 text-xs">{errors.fullName}</p>}
            </div>
            <div>
              <Label htmlFor="email" className="mb-1.5">אימייל</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                onBlur={() => validateField("email")}
                aria-invalid={!!errors.email}
                required
              />
              {errors.email && <p className="text-destructive mt-1 text-xs">{errors.email}</p>}
            </div>
            <div>
              <Label htmlFor="phone" className="mb-1.5">טלפון</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                placeholder="050-1234567"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                onBlur={() => validateField("phone")}
                aria-invalid={!!errors.phone}
                required
              />
              {errors.phone && <p className="text-destructive mt-1 text-xs">{errors.phone}</p>}
            </div>
          </div>
        </section>

        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">2. משלוח</h2>
          <RadioGroup
            value={form.deliveryMethod}
            onValueChange={(v) => update("deliveryMethod", v as "DELIVERY" | "PICKUP")}
            className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <Label
              htmlFor="delivery-home"
              className="border-input has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem value="DELIVERY" id="delivery-home" />
              <Truck className="size-4" /> משלוח עד הבית
            </Label>
            <Label
              htmlFor="delivery-pickup"
              className="border-input has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem value="PICKUP" id="delivery-pickup" />
              <Store className="size-4" /> איסוף עצמי מהסניף
            </Label>
          </RadioGroup>

          {form.deliveryMethod === "DELIVERY" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-2">
                <Label className="mb-1.5">עיר</Label>
                {/* Suggestions, not a closed list — the input stays free text
                    so anywhere in the country can be typed, but the common
                    spelling is one keystroke away. A misspelled city is a
                    delivery routed to the wrong depot. */}
                <Input
                  list="israeli-cities"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  autoComplete="address-level2"
                />
                <datalist id="israeli-cities">
                  {ISRAELI_CITY_SUGGESTIONS.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
                {errors.city && <p className="text-destructive mt-1 text-xs">{errors.city}</p>}
              </div>
              <div className="col-span-2 sm:col-span-2">
                <Label className="mb-1.5">רחוב</Label>
                <Input value={form.street} onChange={(e) => update("street", e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5">מספר בית</Label>
                <Input value={form.houseNo} onChange={(e) => update("houseNo", e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5">דירה (אופציונלי)</Label>
                <Input value={form.apartment} onChange={(e) => update("apartment", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <Label className="mb-1.5">הערות למשלוח</Label>
                <Textarea value={form.deliveryNotes} onChange={(e) => update("deliveryNotes", e.target.value)} rows={2} />
              </div>
            </div>
          )}
          {form.deliveryMethod === "PICKUP" && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Home className="size-4" /> ניתן לאסוף מהסניף הקרוב, פרטים יישלחו לאחר ההזמנה.
            </p>
          )}
        </section>

        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">3. תשלום</h2>
          <RadioGroup
            value={form.paymentMethod}
            onValueChange={(v) => update("paymentMethod", v as "DEMO_CARD" | "CASH_ON_DELIVERY")}
            className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <Label
              htmlFor="pay-card"
              className="border-input has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem value="DEMO_CARD" id="pay-card" />
              <CreditCard className="size-4" /> כרטיס אשראי
            </Label>
            <Label
              htmlFor="pay-cod"
              className="border-input has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem value="CASH_ON_DELIVERY" id="pay-cod" />
              תשלום במזומן באספקה
            </Label>
          </RadioGroup>

          {form.paymentMethod === "DEMO_CARD" && (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground bg-muted flex items-center gap-2 rounded-md p-2 text-xs">
                <ShieldCheck className="size-4 shrink-0" />
                זהו סביבת הדגמה בלבד — לא מבוצע חיוב אמיתי ופרטי הכרטיס אינם נשמרים.
              </p>
              <div>
                <Label className="mb-1.5">מספר כרטיס</Label>
                <Input
                  placeholder="4580 0000 0000 0000"
                  value={form.cardNumber}
                  onChange={(e) => update("cardNumber", formatCardNumber(e.target.value))}
                  onBlur={() => validateField("cardNumber")}
                  aria-invalid={!!errors.cardNumber}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
                {errors.cardNumber && <p className="text-destructive mt-1 text-xs">{errors.cardNumber}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">תוקף</Label>
                  <Input
                    placeholder="MM/YY"
                    value={form.cardExpiry}
                    onChange={(e) => update("cardExpiry", formatCardExpiry(e.target.value))}
                    onBlur={() => validateField("cardExpiry")}
                    aria-invalid={!!errors.cardExpiry}
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                  {errors.cardExpiry && <p className="text-destructive mt-1 text-xs">{errors.cardExpiry}</p>}
                </div>
                <div>
                  <Label className="mb-1.5">CVV</Label>
                  <Input
                    placeholder="123"
                    value={form.cardCvv}
                    onChange={(e) => update("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    onBlur={() => validateField("cardCvv")}
                    aria-invalid={!!errors.cardCvv}
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                  {errors.cardCvv && <p className="text-destructive mt-1 text-xs">{errors.cardCvv}</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="border-border h-fit rounded-xl border p-5 lg:sticky lg:top-24">
        <h2 className="mb-4 font-semibold">4. סיכום הזמנה</h2>
        <ul className="mb-4 flex max-h-64 flex-col gap-3 overflow-y-auto">
          {cart.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
                {item.image ? (
                  <Image src={item.image} alt={item.title} fill className="object-cover" sizes="56px" />
                ) : (
                  <ProductImagePlaceholder title={item.title} brand={displayBrandName(item.brandName) ?? undefined} />
                )}
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                  {item.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.title}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <Separator className="mb-3" />
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">סכום ביניים</span>
            <span className="tabular-nums">{formatPrice(cart.subtotal)}</span>
          </div>
          {cart.discount > 0 && (
            <div className="text-success flex justify-between">
              <span>הנחה</span>
              <span className="tabular-nums">-{formatPrice(cart.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">משלוח</span>
            <span className="tabular-nums">{cart.deliveryFee === 0 ? "חינם" : formatPrice(cart.deliveryFee)}</span>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="mb-4 flex justify-between text-base font-bold">
          <span>סה&quot;כ לתשלום</span>
          <span className="tabular-nums">{formatPrice(cart.total)}</span>
        </div>
        <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
          <Checkbox
            checked={acceptedTerms}
            onCheckedChange={(v) => setAcceptedTerms(v === true)}
            className="mt-0.5"
            aria-label="אישור תקנון ומדיניות פרטיות"
          />
          <span className="text-muted-foreground">
            קראתי ואני מסכים/ה ל
            <Link href="/page/terms" className="text-brand hover:underline" target="_blank">
              תקנון האתר
            </Link>
            , ל
            <Link href="/page/privacy" className="text-brand hover:underline" target="_blank">
              מדיניות הפרטיות
            </Link>{" "}
            ול
            <Link href="/page/returns" className="text-brand hover:underline" target="_blank">
              מדיניות ביטולים והחזרות
            </Link>
            .
          </span>
        </label>
        <Button variant="brand" size="lg" className="w-full" disabled={isPending} onClick={submit}>
          {isPending ? "מבצע הזמנה..." : `בצע הזמנה - ${formatPrice(cart.total)}`}
        </Button>
      </div>
    </div>
  );
}
