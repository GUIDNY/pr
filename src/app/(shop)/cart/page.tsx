"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, ShoppingCart, Trash2, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { useCartStore } from "@/stores/cart-store";
import { formatPrice } from "@/lib/format";
import {
  updateCartItemAction,
  removeCartItemAction,
  applyCouponAction,
  removeCouponAction,
} from "@/actions/cart";

export default function CartPage() {
  const { cart, setCart, isPending, setPending } = useCartStore();
  const [couponInput, setCouponInput] = useState("");
  const [, startTransition] = useTransition();

  function runAction(promise: Promise<Awaited<ReturnType<typeof updateCartItemAction>>>) {
    setPending(true);
    startTransition(() => {
      promise.then((summary) => setCart(summary)).finally(() => setPending(false));
    });
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <ShoppingCart className="text-muted-foreground/40 size-20" strokeWidth={1} />
        <h1 className="text-xl font-bold">העגלה שלך ריקה</h1>
        <p className="text-muted-foreground text-sm">עדיין לא הוספתם מוצרים לעגלה.</p>
        <Button variant="brand" asChild className="mt-2">
          <Link href="/">
            המשך בקניות <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">עגלת הקניות שלי ({cart.itemCount})</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="border-border divide-border divide-y rounded-xl border">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              <Link href={`/product/${item.slug}`} className="bg-muted relative size-24 shrink-0 overflow-hidden rounded-lg sm:size-28">
                {item.image ? (
                  <Image src={item.image} alt={item.title} fill className="object-cover" sizes="112px" />
                ) : (
                  <ProductImagePlaceholder title={item.title} brand={item.brandName} />
                )}
              </Link>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/product/${item.slug}`} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-sm">{item.brandName}</p>
                  </div>
                  <button
                    onClick={() => runAction(removeCartItemAction(item.id))}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="הסר מהעגלה"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="border-input flex items-center rounded-md border">
                    <button
                      disabled={isPending}
                      onClick={() => runAction(updateCartItemAction(item.id, item.quantity - 1))}
                      className="p-2 disabled:opacity-40"
                      aria-label="הפחת כמות"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                    <button
                      disabled={isPending || item.quantity >= item.maxQuantity}
                      onClick={() => runAction(updateCartItemAction(item.id, item.quantity + 1))}
                      className="p-2 disabled:opacity-40"
                      aria-label="הוסף כמות"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <span className="font-bold tabular-nums">{formatPrice(item.lineTotal)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-border h-fit rounded-xl border p-5">
          {cart.couponCode ? (
            <div className="bg-success/10 text-success mb-3 flex items-center justify-between rounded-md px-3 py-2 text-sm">
              <span>קופון {cart.couponCode} הופעל</span>
              <button onClick={() => runAction(removeCouponAction())} aria-label="הסר קופון">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!couponInput.trim()) return;
                runAction(applyCouponAction(couponInput));
                setCouponInput("");
              }}
            >
              <Input placeholder="קוד קופון" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className="h-9" />
              <Button type="submit" variant="outline" size="sm" className="h-9">
                החל
              </Button>
            </form>
          )}
          {cart.couponError && <p className="text-destructive mb-2 text-xs">{cart.couponError}</p>}

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
          <div className="flex justify-between text-base font-bold">
            <span>סה&quot;כ לתשלום</span>
            <span className="tabular-nums">{formatPrice(cart.total)}</span>
          </div>

          <Button variant="brand" size="lg" className="mt-4 w-full" asChild>
            <Link href="/checkout">המשך לתשלום</Link>
          </Button>
          <Button variant="ghost" className="mt-1 w-full" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" /> המשך בקניות
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
