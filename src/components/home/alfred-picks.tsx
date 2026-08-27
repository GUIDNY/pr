"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Send } from "lucide-react";
import { formatPrice, discountPercent } from "@/lib/format";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/components/product/product-card";

type ChatTurn = { role: "user" | "model"; text: string };
type ProductHit = { title: string; slug: string; price: number; imageUrl: string | null; stockStatus: string };
type Message = ChatTurn & { products?: ProductHit[]; failed?: boolean };

function openingLine(products: ProductCardData[]): string {
  const parts = products.map((p) => {
    const pct = discountPercent(p.price, p.compareAtPrice ?? undefined);
    return pct ? `${p.title} (${pct}% הנחה)` : p.title;
  });
  return `היי! 👋 בחרתי בשבילכם ${products.length} מבצעים שווים היום: ${parts.join(", ")}. יש שאלה על אחד מהם? אני כאן.`;
}

// The chatbot-style half of the hero's two-sided panel: a small real "here
// are today's deals" opener (no typing needed to see it) followed by a real
// WhatsApp-style conversation — reusing the exact /api/alfred-chat endpoint
// the floating widget uses, just with these specific products pinned into
// its context so Alfred can talk about them by name/price without
// guessing. Which products show up here is admin-configurable (see
// /admin/homepage-alfred) — `products` is already resolved server-side.
export function AlfredPicks({ products }: { products: ProductCardData[] }) {
  const greeting = useMemo<Message>(() => ({ role: "model", text: openingLine(products) }), [products]);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  async function send() {
    const text = input.trim();
    if (!text || isSending || products.length === 0) return;
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsSending(true);
    try {
      const res = await fetch("/api/alfred-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, pinnedProductIds: products.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "model", text: data.error ?? "משהו השתבש, נסו שוב.", failed: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "model", text: data.reply, products: data.products }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "model", text: "לא הצלחתי להתחבר כרגע. נסו שוב בעוד רגע.", failed: true }]);
    } finally {
      setIsSending(false);
    }
  }

  if (products.length === 0) return null;

  return (
    <div className="border-primary-foreground/15 bg-primary-foreground/5 flex flex-col gap-3 rounded-2xl border p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm">
        <Image
          src="/mascot/alfred.png"
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0 rounded-full object-cover object-top"
        />
        <span className="text-primary-foreground/80 font-semibold">אלפרד ממליץ</span>
      </div>

      {/* Today's up-to-3 curated picks, admin-chosen — a real row, not one
          rotating card. */}
      <div className="flex gap-2">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className="bg-primary-foreground/5 hover:bg-primary-foreground/10 flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl p-2 text-center transition-colors"
          >
            <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg sm:size-14">
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt={p.title} fill sizes="56px" className="object-cover" />
              ) : (
                <ProductImagePlaceholder title={p.title} icon={p.categoryIcon} />
              )}
            </div>
            <p className="w-full truncate text-[11px] font-medium">{p.title}</p>
            <p className="text-brand text-xs font-black tabular-nums">{formatPrice(p.price)}</p>
          </Link>
        ))}
      </div>

      {/* WhatsApp-style conversation, same visual language and the same
          /api/alfred-chat endpoint as the floating chat widget — just
          embedded here with these 3 products pinned into its context. */}
      <div ref={scrollRef} className="flex max-h-40 flex-col gap-2 overflow-y-auto pe-1">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex flex-col gap-1.5", m.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-brand text-brand-foreground rounded-es-md"
                  : m.failed
                    ? "bg-destructive/20 text-primary-foreground rounded-ss-md"
                    : "bg-primary-foreground/10 text-primary-foreground rounded-ss-md"
              )}
            >
              {m.text}
            </div>
            {m.products && m.products.length > 0 && (
              <div className="flex w-full max-w-[90%] flex-col gap-1">
                {m.products.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/product/${p.slug}`}
                    className="border-primary-foreground/15 hover:border-brand/50 bg-primary-foreground/5 flex items-center gap-2 rounded-lg border p-1.5 transition-colors"
                  >
                    <div className="bg-muted relative size-8 shrink-0 overflow-hidden rounded-md">
                      {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="32px" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{p.title}</p>
                      <p className="text-brand text-[11px] font-bold">{formatPrice(p.price)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {isSending && (
          <div className="flex items-start">
            <div className="bg-primary-foreground/10 flex items-center gap-1 rounded-2xl rounded-ss-md px-3 py-2">
              <span className="bg-primary-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-primary-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-primary-foreground/50 size-1.5 animate-bounce rounded-full" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="שאלו את אלפרד על המבצעים..."
          // A placeholder is not a label: it disappears the moment someone
          // types, and screen readers are not required to announce it, so
          // without this the field is just "edit text" with no purpose.
          aria-label="שאלו את אלפרד על המבצעים"
          disabled={isSending}
          className="border-primary-foreground/20 placeholder:text-primary-foreground/50 text-primary-foreground flex-1 rounded-full border bg-transparent px-3.5 py-2 text-xs outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={isSending || !input.trim()}
          aria-label="שלח"
          className="bg-brand text-brand-foreground flex size-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Send className="size-3.5 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
