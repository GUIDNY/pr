"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteAction } from "@/actions/favorites";
import { cn } from "@/lib/utils";
import { navigateOutOfMallFrame } from "@/lib/mall";
import { useIsFavorite } from "@/components/layout/session-summary-provider";

export function FavoriteButton({
  productId,
  initialFavorite = false,
  className,
}: {
  productId: string;
  initialFavorite?: boolean;
  className?: string;
}) {
  // Two sources, and the local one wins once it exists. `initialFavorite` is
  // whatever the server knew (nothing, on a cached page); the provider brings
  // the visitor's real list a moment later; and `toggled` is this button's own
  // click, which must not be undone by a list fetched before it.
  const fromList = useIsFavorite(productId);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const isFavorite = toggled ?? (fromList || initialFavorite);
  const setIsFavorite = setToggled;
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
              // Out of the 3D mall's frame when the page is in one: a login
              // inside a panel over the game signs in a frame the customer
              // is about to close. See lib/mall.ts.
              action: {
                label: "התחברות",
                onClick: () => {
                  if (!navigateOutOfMallFrame("/login")) window.location.href = "/login";
                },
              },
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
