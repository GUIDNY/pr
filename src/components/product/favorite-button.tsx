"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteAction } from "@/actions/favorites";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  productId,
  initialFavorite = false,
  className,
}: {
  productId: string;
  initialFavorite?: boolean;
  className?: string;
}) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          const result = await toggleFavoriteAction(productId);
          if (result.requiresAuth) {
            toast("יש להתחבר כדי לשמור מוצרים במועדפים", {
              action: { label: "התחברות", onClick: () => (window.location.href = "/login") },
            });
            return;
          }
          setIsFavorite(result.isFavorite);
        });
      }}
      className={cn(
        "bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full shadow-sm backdrop-blur transition-colors disabled:opacity-50",
        className
      )}
    >
      <Heart className={cn("size-4", isFavorite ? "fill-brand text-brand" : "text-foreground")} />
    </button>
  );
}
