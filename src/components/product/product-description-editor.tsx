"use client";

import { useState } from "react";
import { Pencil, Link as LinkIcon } from "lucide-react";
import { InlineEditField } from "@/components/product/inline-edit-field";
import { ProductDescriptionText } from "@/components/product/product-description-text";
import { updateProductBasicAction } from "@/actions/admin-products";

// A Server Component can't pass a closure like `(v) => action(id, v)` as a
// prop straight into a Client Component — only a direct reference to a
// "use server" function survives that boundary. Building the closure here,
// entirely on the client side, avoids that RSC serialization error.
//
// Collapsed view renders the same formatted-paragraph display customers
// see (ProductDescriptionText) with a separate pencil trigger, rather than
// InlineEditField's own plain-text collapsed view — that view is
// deliberately plain (it's a <button>, which can't legally contain
// paragraph markup), so a formatted display needs its own trigger, same
// pattern as ProductPriceEditor/ProductTitleEditor.
export function ProductDescriptionEditor({
  productId,
  description,
  sourceUrl,
}: {
  productId: string;
  description: string;
  // Where this text was scraped from, set via /api/integrations/product-
  // enrich's descriptionSourceUrl — this component only ever renders for an
  // admin viewer (see product/[slug]/page.tsx), so showing it here is
  // already admin-only with no extra gating needed.
  sourceUrl?: string | null;
}) {
  const [currentDescription, setCurrentDescription] = useState(description);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="group/desc relative">
        {currentDescription ? (
          <ProductDescriptionText text={currentDescription} />
        ) : (
          <p className="text-muted-foreground text-sm italic">אין תיאור — לחצו על העיפרון כדי להוסיף</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-amber-600 bg-background absolute top-0 -start-8 rounded-full p-1 opacity-0 shadow transition-opacity group-hover/desc:opacity-100"
          aria-label="ערוך תיאור"
        >
          <Pencil className="size-4" />
        </button>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-brand mt-2 flex w-fit items-center gap-1 text-xs"
          >
            <LinkIcon className="size-3" />
            מקור: {sourceUrl}
          </a>
        )}
      </div>
    );
  }

  return (
    <InlineEditField
      value={currentDescription}
      type="textarea"
      startInEditMode
      onCancel={() => setEditing(false)}
      onSave={async (value) => {
        const result = await updateProductBasicAction(productId, { description: value });
        if (result.success) {
          setCurrentDescription(value);
          setEditing(false);
        }
        return result;
      }}
    />
  );
}
