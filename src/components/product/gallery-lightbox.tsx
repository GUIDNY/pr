"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";

/**
 * The product photographs, full screen.
 *
 * The photograph is the most tapped thing on the phone product page — 125 of
 * 429 taps in a month of recordings — and tapping it did nothing. People tap
 * a product photo to look closer; this is the look closer.
 *
 * A row of full-width slides with scroll-snap, so moving between photographs
 * is the browser's own swipe and pinch-zoom is the browser's own pinch: no
 * gesture code to get wrong on one phone and not another. It opens on the
 * photograph that was showing.
 */
export function GalleryLightbox({
  images,
  title,
  index,
  open,
  onOpenChange,
}: {
  images: { id: string; url: string }[];
  title: string;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const startSlide = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // After the dialog has mounted its content: the slide has no box before.
    const frame = requestAnimationFrame(() => {
      startSlide.current?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, index]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[70] flex flex-col bg-white outline-none"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <DialogPrimitive.Title className="text-foreground line-clamp-1 text-sm font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="סגירת התמונה"
              className="border-border text-foreground flex size-10 shrink-0 items-center justify-center rounded-full border bg-white"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain">
            {images.map((img, i) => (
              <div
                key={img.id}
                ref={i === index ? startSlide : undefined}
                className="relative h-full w-full shrink-0 snap-center"
              >
                <Image
                  src={img.url}
                  referrerPolicy="no-referrer"
                  alt={images.length > 1 ? `${title} — תמונה ${i + 1} מתוך ${images.length}` : title}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <p className="text-muted-foreground py-3 text-center text-xs">
              {images.length} תמונות · החליקו לצדדים
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
