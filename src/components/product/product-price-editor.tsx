"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { PriceBlock } from "@/components/product/price-block";
import { InlineEditField } from "@/components/product/inline-edit-field";
import { updateProductBasicAction } from "@/actions/admin-products";

export function ProductPriceEditor({
  productId,
  price,
  compareAtPrice,
  installmentMonths,
}: {
  productId: string;
  price: number;
  compareAtPrice: number | null;
  installmentMonths: number | null;
}) {
  const [currentPrice, setCurrentPrice] = useState(price);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="group/price flex items-center gap-2">
        <PriceBlock price={currentPrice} compareAtPrice={compareAtPrice} installmentMonths={installmentMonths} size="lg" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-amber-600 opacity-0 transition-opacity group-hover/price:opacity-100"
          aria-label="ערוך מחיר"
        >
          <Pencil className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <InlineEditField
      value={String(currentPrice)}
      type="number"
      startInEditMode
      onCancel={() => setEditing(false)}
      onSave={async (value) => {
        const numeric = Number(value);
        const result = await updateProductBasicAction(productId, { price: numeric });
        if (result.success) {
          setCurrentPrice(numeric);
          setEditing(false);
        }
        return result;
      }}
    />
  );
}
