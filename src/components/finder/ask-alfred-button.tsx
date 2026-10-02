"use client";

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { ALFRED_OPEN_EVENT } from "@/lib/bottom-nav";
import { cn } from "@/lib/utils";

/** Opens the Alfred chat panel where the person already is. */
export function AskAlfredButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ALFRED_OPEN_EVENT))}
      className={cn(
        "border-border bg-card hover:border-brand/40 inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-all hover:shadow-md",
        className
      )}
    >
      <Image src="/mascot/alfred-face.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full object-cover" />
      <span className="min-w-0 flex-1">{children}</span>
      <MessageCircle className="text-brand size-5 shrink-0" />
    </button>
  );
}
