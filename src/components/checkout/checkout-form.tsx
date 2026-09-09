"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CreditCard, Home, ShieldCheck, Truck, Store, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { CheckoutTestPanel } from "@/components/checkout/checkout-test-panel";
import { PaymentFrame } from "@/components/checkout/payment-frame";
import { useCartStore } from "@/stores/cart-store";
import { MetaInitiateCheckout } from "@/components/analytics/meta-events";
import { createOrderAction } from "@/actions/orders";
import { saveCheckoutContactAction } from "@/actions/cart";
import { formatPrice } from "@/lib/format";
import type { CheckoutInput } from "@/lib/order-schema";

export function CheckoutForm({
  defaultName,
  defaultEmail,
  defaultPhone,
  payViaGateway = false,
  isStaff = false,
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  /** True once the Pelecard flow is switched on: the card is then entered on
      Pelecard's own page, and this form never sees a card number. */
  payViaGateway?: boolean;
  /** Staff only, resolved on the server. Shows the test panel — never a
      customer-visible affordance, and the action behind it checks again. */
  isStaff?: boolean;
}) {
  const cart = useCartStore((s) => s.cart);
  const setCart = useCartStore((s) => s.setCart);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  /* Two fields the demo shows only so it matches Pelecard's form field for
     field. They are deliberately NOT part of `form`: the checkout schema
     decides what an order carries, and a skin is not a reason to change it. */
  const [demoHolderName, setDemoHolderName] = useState("");
  const [demoIdNumber, setDemoIdNumber] = useState("");

  /* Once this is set the order exists and the gateway's form is on the page.
     The checkout does not navigate anywhere to collect a card: step 3 stops
     being our fields and becomes Pelecard's, in the same place, so the
     customer never leaves the page they have been filling in. */
  const [payment, setPayment] = useState<{ url: string; orderNumber: string } | null>(null);
  /* An order that exists but whose payment could not be opened. Kept apart
     from a failed order: there is nothing to fill in again, only something to
     retry, and telling somebody to re-enter an address they already gave is
     how a paid-for cart gets abandoned. */
  const [stranded, setStranded] = useState<{ orderId: string; orderNumber: string; reason: string } | null>(null);

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

  /* Fills the form well enough to pass validation, so the demo lane can be run
     end to end in one press instead of eleven. The card number is the one every
     payment provider publishes as their test Visa — it is not a card, it just
     satisfies the twelve-digit check the DEMO_CARD path makes. */
  function fillTestDetails() {
    setForm((f) => ({
      ...f,
      fullName: f.fullName || "בדיקה פנימית",
      email: f.email || "test@prec.co.il",
      phone: f.phone || "0500000000",
      city: f.city || "חיפה",
      street: f.street || "הרצל",
      houseNo: f.houseNo || "1",
      paymentMethod: "DEMO_CARD",
      cardNumber: "4580000000000000",
      cardExpiry: "12/29",
      cardCvv: "123",
    }));
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

  /* The order is created first and the payment opened against it, in that
     order and never the other way round: the amount is read from the order on
     the server, so a browser that could name the price could name it as 1.

     Two calls rather than one because the failures are different. An order
     that was never created is a form to fix; an order that exists but whose
     payment would not open is a button to press again. Folding them together
     would send somebody back to re-type an address the shop already has. */
  async function openPayment(orderId: string, orderNumber: string) {
    setStranded(null);
    try {
      const res = await fetch("/api/pelecard/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) {
        setStranded({ orderId, orderNumber, reason: data.error ?? "לא הצלחנו לפתוח את טופס התשלום" });
        return;
      }
      setPayment({ url: data.redirectUrl, orderNumber });
    } catch {
      setStranded({ orderId, orderNumber, reason: "אין חיבור לשרת התשלומים" });
    }
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
        await openPayment(result.orderId, result.orderNumber);
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
      {/* Below the empty-cart branch on purpose: reaching the checkout with
          nothing in the basket is not the start of one. The store hydrates
          after mount, and the event fires on the first render that has items. */}
      <MetaInitiateCheckout
        value={cart.total}
        contents={cart.items.map((i) => ({ id: i.sku, quantity: i.quantity }))}
      />
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">תשלום</h1>

        {isStaff && (
          <CheckoutTestPanel
            onFillTestDetails={fillTestDetails}
            onPaymentOpened={(url, orderNumber) => setPayment({ url, orderNumber })}
          />
        )}

        {/* display:contents, so the two sections keep their place in the column
            while the fieldset does the one thing it is here for: once the order
            exists, the details it was built from are no longer editable. */}
        <fieldset disabled={!!payment} className="contents">
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

        </fieldset>

        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">3. תשלום</h2>

          {payment ? (
            <div className="flex flex-col gap-3">
              {/* One line, and the order number does not break out of it: it
                  used to wrap onto a line of its own and split the sentence
                  around it. The frame below carries its own security notice,
                  so this one says the short half. */}
              <p className="text-muted-foreground bg-muted flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs">
                <Lock className="text-success size-3.5 shrink-0" />
                <span>
                  הזמנה{" "}
                  <span className="text-foreground font-semibold whitespace-nowrap">{payment.orderNumber}</span>{" "}
                  נוצרה · פרטי הכרטיס מוזנים אצל חברת הסליקה ואינם עוברים דרך האתר
                </span>
              </p>
              <PaymentFrame src={payment.url} />
            </div>
          ) : stranded ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-destructive/90 border-destructive/30 rounded-md border p-3 text-xs leading-relaxed">
                הזמנה <span className="font-semibold">{stranded.orderNumber}</span> נשמרה, אבל טופס התשלום לא
                נפתח ({stranded.reason}). ההזמנה מחכה — אפשר לנסות שוב, ואם זה חוזר נשמח שתתקשרו.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => startTransition(async () => { await openPayment(stranded.orderId, stranded.orderNumber); })}
                disabled={isPending}
              >
                <RotateCcw className="size-4" />
                נסו שוב
              </Button>
            </div>
          ) : (
          <>
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

          {/* THE DEMO FORM IS LAID OUT FIELD FOR FIELD LIKE PELECARD'S.

              Not decoration. This is the lane the order flow, the delivery flow
              and everything downstream get worked on, and a rehearsal on a form
              that is shaped differently from the real one rehearses the wrong
              thing — a row that fits here and wraps there is a bug nobody finds
              until a customer is standing in it.

              So the shape is theirs, read from their DOM: cardholder name on a
              row of its own, card number beside the expiry pair, identity
              number beside the CVV, and the amount as a strip under the fields.
              The captions are their captions.

              What is NOT theirs is the line at the top. The form is a faithful
              copy and nothing here is charged, and those two facts together are
              exactly how somebody comes to believe they have paid when they
              have not. The notice is the part that must never be copied away. */}
          {form.paymentMethod === "DEMO_CARD" && !payViaGateway && (
            <div className="flex flex-col gap-3">
              <p className="border-amber-300 bg-amber-50 text-amber-900 flex items-center gap-2 rounded-md border p-2 text-xs font-medium dark:bg-amber-950/30 dark:text-amber-200">
                <ShieldCheck className="size-4 shrink-0" />
                מצב הדגמה — הטופס זהה לטופס הסליקה האמיתי, אך לא מבוצע חיוב ופרטי הכרטיס אינם נשמרים.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">שם בעל הכרטיס/חברה</Label>
                  <Input value={demoHolderName} onChange={(e) => setDemoHolderName(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <Label className="mb-1.5">מספר כרטיס</Label>
                  <Input
                    placeholder="4580 0000 0000 0000"
                    value={form.cardNumber}
                    onChange={(e) => update("cardNumber", e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  {errors.cardNumber && <p className="text-destructive mt-1 text-xs">{errors.cardNumber}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">תוקף כרטיס</Label>
                  {/* Two selects with a slash between them, as on their page —
                      a free-text MM/YY is a different control with different
                      mistakes available in it. */}
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="חודש"
                      className="border-input h-8 flex-1 rounded-lg border bg-transparent px-2.5 text-sm"
                      value={form.cardExpiry.split("/")[0] ?? ""}
                      onChange={(e) => update("cardExpiry", `${e.target.value}/${form.cardExpiry.split("/")[1] ?? ""}`)}
                    >
                      <option value="">חודש</option>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">/</span>
                    <select
                      aria-label="שנה"
                      className="border-input h-8 flex-1 rounded-lg border bg-transparent px-2.5 text-sm"
                      value={form.cardExpiry.split("/")[1] ?? ""}
                      onChange={(e) => update("cardExpiry", `${form.cardExpiry.split("/")[0] ?? ""}/${e.target.value}`)}
                    >
                      <option value="">שנה</option>
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5">תעודת זהות</Label>
                  <Input value={demoIdNumber} onChange={(e) => setDemoIdNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">קוד אימות כרטיס (CVV)</Label>
                  <Input placeholder="123" value={form.cardCvv} onChange={(e) => update("cardCvv", e.target.value)} inputMode="numeric" autoComplete="off" />
                </div>
              </div>

              {/* Their amount strip, in the same place in the form: a tinted
                  row between the card fields and the button, not a heading. */}
              <div className="bg-muted flex items-baseline justify-between rounded-md px-3 py-2">
                <span className="text-sm font-semibold">סה״כ לתשלום</span>
                <span className="text-base font-bold tabular-nums">{formatPrice(cart.total)}</span>
              </div>
            </div>
          )}
          </>
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
        {payment ? (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs leading-relaxed">
            ההזמנה נוצרה וממתינה לתשלום. השלימו את פרטי הכרטיס בטופס המאובטח שבסעיף 3.
          </p>
        ) : (
          <Button variant="brand" size="lg" className="w-full" disabled={isPending} onClick={submit}>
            {isPending ? "מבצע הזמנה..." : `בצע הזמנה - ${formatPrice(cart.total)}`}
          </Button>
        )}
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
