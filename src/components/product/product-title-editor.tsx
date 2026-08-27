"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { InlineEditField } from "@/components/product/inline-edit-field";
import { updateProductBasicAction } from "@/actions/admin-products";

// A heading tag can't legally live inside InlineEditField's clickable
// button wrapper (buttons only accept phrasing content) — so the title
// gets its own trigger, same shape as the price editor, instead of routing
// through InlineEditField's own collapsed view via a render prop.
export function ProductTitleEditor({ productId, title }: { productId: string; title: string }) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="group/title mt-1 flex items-start gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{currentTitle}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-amber-600 mt-1.5 shrink-0 opacity-0 transition-opacity group-hover/title:opacity-100"
          aria-label="ערוך שם מוצר"
        >
          <Pencil className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <InlineEditField
        value={currentTitle}
        startInEditMode
        onCancel={() => setEditing(false)}
        onSave={async (value) => {
          const result = await updateProductBasicAction(productId, { title: value });
          if (result.success) {
            setCurrentTitle(value);
            setEditing(false);
          }
          return result;
        }}
      />
    </div>
  );
}
