import Image from "next/image";
import { Package } from "lucide-react";

/**
 * The product itself, where there is a photograph of it, and a box where
 * there is not.
 *
 * Both queues used to draw the same grey box for every row. On "טיפול" that
 * hid the most useful thing on the screen: most of that list is waiting for a
 * photo — that is why those products are off the site — so the ones that
 * already have one are there for a completely different reason. Now you can
 * see which is which without reading a word.
 */
export function ReviewProductThumb({
  url,
  alt,
  tone = "muted",
}: {
  url: string | undefined;
  alt: string;
  tone?: "muted" | "destructive";
}) {
  if (!url) {
    return (
      <span
        className={
          tone === "destructive"
            ? "bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-lg"
            : "bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-lg"
        }
      >
        <Package className="size-5" />
      </span>
    );
  }

  return (
    <span className="border-border bg-background relative size-11 shrink-0 overflow-hidden rounded-lg border">
      {/* alt is empty on purpose: the product's name is the next thing in the
          row, and repeating it here would have a screen reader say it twice. */}
      <Image src={url} alt="" fill sizes="44px" className="object-contain" unoptimized />
      <span className="sr-only">{alt}</span>
    </span>
  );
}
