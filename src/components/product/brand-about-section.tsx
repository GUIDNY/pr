"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, Pencil, Plus, X, Check as CheckIcon, X as XIcon } from "lucide-react";
import { ProductDescriptionText } from "@/components/product/product-description-text";
import { updateBrandAboutAction, addBrandImageAction, removeBrandImageAction } from "@/actions/admin-brands";
import { cn } from "@/lib/utils";

type BrandImageT = { id: string; url: string };

// Renders nothing for a non-admin viewer when there's genuinely no content
// yet — this is real researched copy an admin adds per brand, not something
// every product page is guaranteed to have, so an empty state has to be
// silent rather than showing a placeholder box on most products.
export function BrandAboutSection({
  brandId,
  brandName,
  aboutContent,
  images,
  isAdmin,
}: {
  brandId: string;
  brandName: string;
  aboutContent: string | null;
  images: BrandImageT[];
  isAdmin: boolean;
}) {
  const [content, setContent] = useState(aboutContent ?? "");
  const [imageList, setImageList] = useState(images);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [addingImage, setAddingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAdmin && !content && imageList.length === 0) return null;

  function saveAbout() {
    setError(null);
    startTransition(async () => {
      const result = await updateBrandAboutAction(brandId, draft);
      if (result.success) {
        setContent(draft);
        setEditing(false);
      } else {
        setError(result.error ?? "שגיאה בשמירה");
      }
    });
  }

  function addImage() {
    const url = imageUrl.trim();
    if (!url) return;
    setError(null);
    startTransition(async () => {
      const result = await addBrandImageAction(brandId, url);
      if (result.success && result.image) {
        setImageList((prev) => [...prev, { id: result.image!.id, url: result.image!.url }]);
        setImageUrl("");
      } else {
        setError(result.error ?? "שגיאה בהוספת תמונה");
      }
    });
  }

  function removeImage(id: string) {
    startTransition(async () => {
      const result = await removeBrandImageAction(id);
      if (result.success) setImageList((prev) => prev.filter((i) => i.id !== id));
    });
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold">
          אודות <span className="text-brand">{brandName}</span>
        </h3>
        {isAdmin && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(content);
              setEditing(true);
            }}
            className="text-amber-600 hover:bg-amber-500/10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          >
            <Pencil className="size-3.5" /> ערוך
          </button>
        )}
      </div>

      {isAdmin && editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            autoFocus
            placeholder="כתבו כמה פסקאות על המותג — היסטוריה, מה הוא ידוע בו, למה אנשים בוחרים בו..."
            className="border-amber-500 focus:ring-amber-500/30 w-full rounded-lg border p-3 text-sm leading-relaxed outline-none focus:ring-2"
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveAbout}
              disabled={isPending}
              className="bg-amber-500 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <CheckIcon className="size-3.5" /> שמור
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-full px-3 py-1 text-xs"
            >
              <XIcon className="size-3.5" /> ביטול
            </button>
          </div>
        </div>
      ) : content ? (
        // Collapsed: a plain 3-line clamp — short and reliable, no need for
        // the richer highlights/lead-paragraph treatment at a glance.
        // Expanded: the full formatted rendering, same as the product
        // description gets, since at that point the reader opted in to
        // reading the whole thing.
        expanded ? (
          <ProductDescriptionText text={content} />
        ) : (
          <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">{content}</p>
        )
      ) : (
        isAdmin && <p className="text-muted-foreground text-sm italic">אין עדיין תוכן — לחצו על &quot;ערוך&quot; כדי להוסיף</p>
      )}

      {content && !editing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-brand mt-2.5 flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          {expanded ? "הצג פחות" : "קרא עוד"}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}

      {(imageList.length > 0 || isAdmin) && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          {imageList.map((img) => (
            <div key={img.id} className="group/bimg relative size-16 shrink-0 overflow-hidden rounded-lg">
              <Image src={img.url} alt="" fill className="object-cover" sizes="64px" />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  disabled={isPending}
                  className="absolute top-1 end-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/bimg:opacity-100"
                  aria-label="הסר תמונה"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
          {isAdmin && !addingImage && (
            <button
              type="button"
              onClick={() => setAddingImage(true)}
              className="border-border text-muted-foreground hover:border-brand hover:text-brand flex size-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors"
              aria-label="הוסף תמונת מותג"
            >
              <Plus className="size-5" />
            </button>
          )}
          {isAdmin && addingImage && (
            <div className="border-border flex w-full max-w-xs items-center gap-1.5 rounded-xl border p-2">
              <input
                autoFocus
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addImage();
                  if (e.key === "Escape") setAddingImage(false);
                }}
                placeholder="כתובת URL של תמונה"
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border-none text-xs outline-none"
              />
              <button type="button" onClick={addImage} disabled={isPending} className="text-brand text-xs font-semibold">
                הוסף
              </button>
              <button type="button" onClick={() => setAddingImage(false)} className="text-muted-foreground text-xs">
                ביטול
              </button>
            </div>
          )}
        </div>
      )}
      {error && !editing && <p className="text-destructive mt-2 text-xs">{error}</p>}
    </div>
  );
}
