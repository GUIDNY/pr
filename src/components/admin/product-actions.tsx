"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duplicateProductAction, togglePublishAction } from "@/actions/admin-products";

export function ProductActions({ productId, slug, isPublished }: { productId: string; slug: string; isPublished: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild className="gap-1.5">
        <Link href={`/product/${slug}`} target="_blank">
          <ExternalLink className="size-4" /> צפייה באתר
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await togglePublishAction(productId, !isPublished);
            toast.success(isPublished ? "המוצר הוסר מהאתר" : "המוצר פורסם");
          })
        }
      >
        {isPublished ? "הסרה מפרסום" : "פרסום מוצר"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={isPending}
        onClick={() => startTransition(() => duplicateProductAction(productId))}
      >
        <Copy className="size-4" /> שכפול
      </Button>
    </div>
  );
}
