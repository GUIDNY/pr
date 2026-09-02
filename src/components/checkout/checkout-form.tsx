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
import { saveCheckoutContactAction } from "@/actions/cart";
import { formatPrice } from "@/lib/format";
import type { CheckoutInput } from "@/lib/order-schema";

export function CheckoutForm({
  defaultName,
  defaultEmail,
  defaultPhone,
  payViaGateway = false,
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  /** True once the Pelecard flow is switched on: the card is then entered on
      Pelecard's own page, and this form never sees a card number. */
  payViaGateway?: boolean;
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

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* Leaving a contact field hands the details to the shop, so a checkout
     someone walks away from halfway is a callback rather than a silent lost
     sale. On blur and not on every keystroke — a half-typed phone number is
     not a lead — and deliberately not awaited: this is a side errand next to
     the order, and it must never be able to delay or break one. */
  function rememberContact() {
    void saveCheckoutContactAction({
      fullName: form.fullName,
      phone: form.phone,
      email: form.email,
    }).catch(() => {});
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      /* The radio still says DEMO_CARD — it is one "credit card" option to the
         customer either way — but with the gateway on, the order is a PELECARD
         order and must say so before it is validated. A DEMO_CARD order is
         required to carry a card number, and this form no longer has one to
         give: that mismatch rejected every gateway order at the door with
         "מספר כרטיס לא תקין". */
      const payload = {
        ...form,
        paymentMethod:
          payViaGateway && form.paymentMethod === "DEMO_CARD" ? "PELECARD" : form.paymentMethod,
      };
      const result = await createOrderAction(payload as CheckoutInput);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בביצוע ההזמנה");
        return;
      }

      /* The order exists but is not paid: on to the payment step, which is a
         page of ours with the gateway's form embedded in it rather than a
         journey off to somebody else's site. It opens the payment itself, so
         there is nothing to fetch here first — one less thing between pressing
         the button and seeing the form.

         The cart is deliberately left as it is: until the payment is confirmed
         there is nothing to clear, and a declined card should leave the
         customer with their cart intact. */
      if (result.requiresPayment) {
        router.push(`/checkout/pay/${encodeURIComponent(result.orderNumber)}`);
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
                onBlur={rememberContact}
                required
              />
            </div>
            <div>
              <Label htmlFor="email" className="mb-1.5">אימייל</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                onBlur={rememberContact}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone" className="mb-1.5">טלפון</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                onBlur={rememberContact}
                required
              />
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
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
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

          {/* With the gateway on, the card is entered on Pelecard's own secure
              page — this site never sees, transmits or stores a card number,
              which is both the PCI requirement and the gateway's own. */}
          {form.paymentMethod === "DEMO_CARD" && payViaGateway && (
            <p className="text-muted-foreground bg-muted flex items-center gap-2 rounded-md p-3 text-xs leading-relaxed">
              <ShieldCheck className="size-4 shrink-0" />
              לאחר לחיצה על &quot;בצע הזמנה&quot; תועברו לעמוד תשלום מאובטח של חברת הסליקה להזנת פרטי הכרטיס. פרטי
              האשראי אינם עוברים דרך האתר ואינם נשמרים בו.
            </p>
          )}

          {form.paymentMethod === "DEMO_CARD" && !payViaGateway && (
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
                  onChange={(e) => update("cardNumber", e.target.value)}
                  inputMode="numeric"
                />
                {errors.cardNumber && <p className="text-destructive mt-1 text-xs">{errors.cardNumber}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">תוקף</Label>
                  <Input placeholder="MM/YY" value={form.cardExpiry} onChange={(e) => update("cardExpiry", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1.5">CVV</Label>
                  <Input placeholder="123" value={form.cardCvv} onChange={(e) => update("cardCvv", e.target.value)} inputMode="numeric" />
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
                  <Image src={item.image} alt={item.title} fill className="bg-white object-contain" sizes="56px" />
                ) : (
                  <ProductImagePlaceholder title={item.title} brand={item.brandName} />
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
        <Button variant="brand" size="lg" className="w-full" disabled={isPending} onClick={submit}>
          {isPending ? "מבצע הזמנה..." : `בצע הזמנה - ${formatPrice(cart.total)}`}
        </Button>
        {/* חובת היידוע שבסעיף 11 לחוק הגנת הפרטיות — מסירת הפרטים כאן אינה חובה
            חוקית, והלקוח זכאי לדעת לשם מה הם נאספים לפני שהוא מוסר אותם, לא
            אחרי. */}
        <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
          הפרטים שתמסרו ישמשו לביצוע ההזמנה, לאספקתה ולמתן שירות ואחריות בלבד. מסירתם אינה חובה חוקית, אך בלעדיהם
          לא ניתן להשלים את ההזמנה. אם תעזבו את העמוד לפני סיום ההזמנה, נשמור את שמכם והטלפון כדי שנוכל ליצור
          קשר ולהשלים אותה איתכם.{" "}
          <Link href="/privacy" className="hover:text-foreground underline">
            מדיניות הפרטיות
          </Link>{" "}
          ·{" "}
          <Link href="/page/terms" className="hover:text-foreground underline">
            תקנון האתר
          </Link>
        </p>
      </div>
    </div>
  );
}
