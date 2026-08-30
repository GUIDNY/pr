"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { X, Send } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChatTurn = { role: "user" | "model"; text: string };
type ProductHit = { title: string; slug: string; price: number; imageUrl: string | null; stockStatus: string };
type Message = ChatTurn & { products?: ProductHit[]; failed?: boolean };

const GREETING: Message = {
  role: "model",
  text: 'היי, אני אלפרד 👋 אפשר לעזור לך למצוא מוצר, לבדוק מחיר וזמינות, או לענות על שאלות לגבי משלוח ואחריות. במה אפשר לעזור?',
};

export function AlfredChatWidget() {
  // The home page already gives Alfred two prominent touchpoints of its
  // own (the hero search panel and the dedicated Alfred section below it)
  // — a third floating avatar competing for attention on top of those was
  // exactly the kind of mobile clutter this redesign pass is removing.
  // Every other mobile page keeps the launcher exactly as before; desktop
  // is untouched everywhere, including the home page.
  const pathname = usePathname();
  const isHome = pathname === "/";
  // Alfred sells to customers. In the back office he is a face floating over
  // the order someone is working on, and his answers are useless there.
  const isAdmin = pathname.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, isSending]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsSending(true);
    try {
      const res = await fetch("/api/alfred-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
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

  if (isAdmin) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "סגור צ'אט עם אלפרד" : "פתח צ'אט עם אלפרד"}
        className={cn(
          "floating-launcher border-border bg-background fixed bottom-24 start-4 z-50 flex size-14 items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105 lg:bottom-6",
          open && "scale-0 opacity-0",
          isHome && "max-sm:hidden"
        )}
      >
        <Image src="/mascot/alfred-chat.png" alt="" width={56} height={56} className="size-full rounded-full object-cover" />
      </button>

      <div
        className={cn(
          "floating-launcher border-border bg-background fixed bottom-24 start-4 z-50 flex h-[min(32rem,70vh)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all duration-200 lg:bottom-6",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        )}
      >
        <div className="bg-primary text-primary-foreground flex items-center gap-3 px-4 py-3">
          <Image src="/mascot/alfred-chat.png" alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">אלפרד</p>
            <p className="text-primary-foreground/70 text-xs">שירות לקוחות A&amp;I Electronics</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="סגור"
            className="hover:bg-primary-foreground/10 flex size-8 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-brand text-brand-foreground rounded-es-md"
                    : m.failed
                      ? "bg-destructive/10 text-destructive rounded-ss-md"
                      : "bg-muted text-foreground rounded-ss-md"
                )}
              >
                {m.text}
              </div>
              {m.products && m.products.length > 0 && (
                <div className="flex w-full max-w-[90%] flex-col gap-1.5">
                  {m.products.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/product/${p.slug}`}
                      className="border-border hover:border-brand/40 bg-background flex items-center gap-2.5 rounded-xl border p-2 transition-colors"
                    >
                      <div className="bg-muted relative size-11 shrink-0 overflow-hidden rounded-lg">
                        {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="bg-white object-contain" sizes="44px" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{p.title}</p>
                        <p className="text-brand text-xs font-bold">{formatPrice(p.price)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-start">
              <div className="bg-muted flex items-center gap-1 rounded-2xl rounded-ss-md px-3.5 py-2.5">
                <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
                <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
                <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full" />
              </div>
            </div>
          )}
        </div>

        <div className="border-border flex items-center gap-2 border-t p-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="תכתבו לאלפרד את המוצר שתרצו..."
            // Same reason as the picks widget: the placeholder is the only
            // thing naming this field, and a placeholder is not a name.
            aria-label="תכתבו לאלפרד את המוצר שתרצו"
            disabled={isSending}
            className="border-input flex-1 rounded-full border px-4 py-2 text-sm outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={isSending || !input.trim()}
            aria-label="שלח"
            className="bg-brand text-brand-foreground flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          >
            <Send className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
        {/* אלפרד עונה באמצעות שירות בינה מלאכותית חיצוני, ולכן מה שנכתב כאן
            יוצא מהאתר. מי שכותב לצ'אט זכאי לדעת את זה לפני שהוא מקליד מספר
            טלפון או פרטי הזמנה, ולא אחרי. */}
        <p className="text-muted-foreground border-border border-t px-3 py-1.5 text-center text-[0.65rem] leading-tight">
          אלפרד הוא עוזר אוטומטי. אין למסור בצ&apos;אט פרטי תשלום.{" "}
          <Link href="/privacy" className="hover:text-foreground underline">
            מדיניות פרטיות
          </Link>
        </p>
      </div>
    </>
  );
}
