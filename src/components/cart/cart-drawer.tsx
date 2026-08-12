"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCartStore } from "@/stores/cart-store";
import { formatPrice } from "@/lib/format";
import {
  updateCartItemAction,
  removeCartItemAction,
  applyCouponAction,
  removeCouponAction,
} from "@/actions/cart";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, setCart, setPending, isPending } = useCartStore();
  const [couponInput, setCouponInput] = useState("");
  const [, startTransition] = useTransition();

  function runAction(promise: Promise<Awaited<ReturnType<typeof updateCartItemAction>>>) {
    setPending(true);
    startTransition(() => {
      promise
        .then((summary) => setCart(summary))
        .catch((err) => console.error(err))
        .finally(() => setPending(false));
    });
  }

  return (
    <Sheet open={isDrawerOpen} onOpenChange={(open) => (open ? undefined : closeDrawer())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="size-5" />
            עגלת הקניות שלי
            {cart.itemCount > 0 && (
              <span className="text-muted-foreground text-sm font-normal">
                ({cart.itemCount} פריטים)
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingCart className="text-muted-foreground/40 size-16" strokeWidth={1} />
            <p className="text-muted-foreground">העגלה שלך ריקה</p>
            <Button variant="brand" onClick={closeDrawer} asChild>
              <Link href="/">המשך בקניות</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col gap-4">
                {cart.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <Link
                      href={`/product/${item.slug}`}
                      onClick={closeDrawer}
                      className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-lg"
                    >
                      <ProductImagePlaceholder title={item.title} brand={item.brandName} />
                    </Link>
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/product/${item.slug}`}
                          onClick={closeDrawer}
                          className="line-clamp-2 text-sm font-medium hover:underline"
                        >
                          {item.title}
                        </Link>
                        <button
                          onClick={() => runAction(removeCartItemAction(item.id))}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="הסר מהעגלה"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <p className="text-muted-foreground text-xs">{item.brandName}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="border-input flex items-center rounded-md border">
                          <button
                            disabled={isPending}
                            onClick={() => runAction(updateCartItemAction(item.id, item.quantity - 1))}
                            className="p-1.5 disabled:opacity-40"
                            aria-label="הפחת כמות"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                          <button
                            disabled={isPending || item.quantity >= item.maxQuantity}
                            onClick={() => runAction(updateCartItemAction(item.id, item.quantity + 1))}
                            className="p-1.5 disabled:opacity-40"
                            aria-label="הוסף כמות"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <span className="font-semibold tabular-nums">{formatPrice(item.lineTotal)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t px-5 py-4">
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
                  <Input
                    placeholder="קוד קופון"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    className="h-9"
                  />
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
                  <span className="tabular-nums">
                    {cart.deliveryFee === 0 ? "חינם" : formatPrice(cart.deliveryFee)}
                  </span>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between text-base font-bold">
                <span>סה&quot;כ לתשלום</span>
                <span className="tabular-nums">{formatPrice(cart.total)}</span>
              </div>
            </div>

            <SheetFooter className="border-t px-5 py-4">
              <Button variant="brand" size="lg" className="w-full" asChild onClick={closeDrawer}>
                <Link href="/checkout">המשך לתשלום</Link>
              </Button>
              <Button variant="ghost" className="w-full" asChild onClick={closeDrawer}>
                <Link href="/cart">צפייה בעגלה המלאה</Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
