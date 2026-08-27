"use client";

import { useState, useTransition } from "react";
import { Flag, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setProductReviewFlagAction } from "@/actions/admin-products";
import { cn } from "@/lib/utils";

type ReviewFlag = "NONE" | "ATTENTION" | "URGENT";

export function ProductReviewFlagButton({ productId, initialFlag }: { productId: string; initialFlag: ReviewFlag }) {
  const [flag, setFlag] = useState<ReviewFlag>(initialFlag);
  const [isPending, startTransition] = useTransition();

  function apply(next: ReviewFlag) {
    const prev = flag;
    setFlag(next);
    startTransition(async () => {
      const result = await setProductReviewFlagAction(productId, next);
      if (!result.success) {
        setFlag(prev);
        toast.error(result.error ?? "משהו השתבש");
        return;
      }
      if (next === "NONE") toast.success("הסימון הוסר");
      else if (next === "URGENT") toast.success("המוצר נשלח לטיפול דחוף");
      else toast.success("המוצר נשלח לטיפול");
    });
  }

  const label = flag === "URGENT" ? "בטיפול דחוף" : flag === "ATTENTION" ? "בטיפול" : "שלח לטיפול";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={flag === "URGENT" ? "destructive" : flag === "ATTENTION" ? "brand-outline" : "outline"}
          size="sm"
          disabled={isPending}
          className={cn("gap-1.5", flag !== "NONE" && "font-semibold")}
        >
          <Flag className="size-4" />
          {label}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={flag === "ATTENTION"} onSelect={() => apply("ATTENTION")}>
          שלח לטיפול
        </DropdownMenuItem>
        <DropdownMenuItem disabled={flag === "URGENT"} onSelect={() => apply("URGENT")}>
          שלח לטיפול דחוף
        </DropdownMenuItem>
        {flag !== "NONE" && (
          <DropdownMenuItem onSelect={() => apply("NONE")}>הסר סימון</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
