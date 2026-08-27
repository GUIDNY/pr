"use client";

import { useState, useTransition, type DragEvent } from "react";
import Image from "next/image";
import { Plus, X, Star, ImagePlus, Upload, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { ProductImagePlaceholder } from "@/components/product/product-image-placeholder";
import { FavoriteButton } from "@/components/product/favorite-button";
import {
  addProductImageAction,
  removeProductImageAction,
  setPrimaryProductImageAction,
  uploadProductImageAction,
} from "@/actions/admin-products";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  url: string;
  // Provenance from /api/integrations/product-enrich, admin-only (see
  // isAdmin-gated badge below) — null for images added through this UI
  // itself (drag-and-drop upload or a plain URL), which have no source page.
  sourcePageUrl?: string | null;
  sourceDomain?: string | null;
  capturedAt?: string | Date | null;
};

// Renders identically to the old plain single-image block for everyone —
// the thumbnail strip and add/remove controls only mount for an admin
// viewer, so this never changes what a customer sees.
export function ProductGallery({
  productId,
  images,
  title,
  brand,
  categoryIcon,
  isFavorite,
  isAdmin,
  warrantyMonths,
}: {
  productId: string;
  images: GalleryImage[];
  title: string;
  // Optional: absent when the product has no identified manufacturer, in
  // which case the placeholder tile carries the category icon alone rather
  // than a "לא ידוע" caption.
  brand?: string;
  categoryIcon: string | null;
  isFavorite: boolean;
  isAdmin: boolean;
  // Shown as a corner badge on the photo itself now, instead of its own
  // card lower on the page (that card repeated the same fact the "משלוח
  // ואחריות" tab already states — see product page).
  warrantyMonths: number;
}) {
  const [localImages, setLocalImages] = useState(images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAddInput, setShowAddInput] = useState(false);
  const [addingUrl, setAddingUrl] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = localImages[activeIndex] ?? null;

  function handleAdd() {
    const url = addingUrl.trim();
    if (!url) return;
    setError(null);
    startTransition(async () => {
      const result = await addProductImageAction(productId, url);
      if (result.success && result.image) {
        // Left open (just cleared) rather than closed — appending several
        // photos in a row is the common case, not adding exactly one.
        setLocalImages((prev) => [...prev, { id: result.image!.id, url: result.image!.url }]);
        setActiveIndex(localImages.length);
        setAddingUrl("");
      } else {
        setError(result.error ?? "שגיאה בהוספת תמונה");
      }
    });
  }

  function handleRemove(imageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeProductImageAction(imageId);
      if (result.success) {
        setLocalImages((prev) => prev.filter((i) => i.id !== imageId));
        setActiveIndex((i) => Math.max(0, Math.min(i, localImages.length - 2)));
      } else {
        setError(result.error ?? "שגיאה בהסרת תמונה");
      }
    });
  }

  function handleSetPrimary(imageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setPrimaryProductImageAction(productId, imageId);
      if (result.success) {
        setLocalImages((prev) => {
          const target = prev.find((i) => i.id === imageId);
          if (!target) return prev;
          return [target, ...prev.filter((i) => i.id !== imageId)];
        });
        setActiveIndex(0);
      } else {
        setError(result.error ?? "שגיאה בהגדרת תמונה ראשית");
      }
    });
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("ניתן לגרור רק קבצי תמונה");
      return;
    }
    setError(null);
    setIsUploading(true);
    startTransition(async () => {
      // Sequential, not Promise.all — each upload also creates a
      // ProductImage row with sortOrder based on the current max, so
      // running them concurrently would race and could hand out the same
      // sortOrder to more than one file.
      for (const file of imageFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadProductImageAction(productId, formData);
        if (result.success && result.image) {
          setLocalImages((prev) => [...prev, { id: result.image!.id, url: result.image!.url }]);
        } else {
          setError(result.error ?? `שגיאה בהעלאת ${file.name}`);
        }
      }
      setIsUploading(false);
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingFile(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="relative">
      <div
        className="bg-muted sticky top-24 aspect-square overflow-hidden rounded-2xl"
        onDragOver={
          isAdmin
            ? (e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }
            : undefined
        }
        onDragLeave={isAdmin ? () => setIsDraggingFile(false) : undefined}
        onDrop={isAdmin ? handleDrop : undefined}
      >
        {active ? (
          <Image
            src={active.url}
            // See product-card.tsx for why these are no-referrer.
            referrerPolicy="no-referrer"
            alt={title}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        ) : (
          <ProductImagePlaceholder title={title} brand={brand} icon={categoryIcon} />
        )}
        <FavoriteButton productId={productId} initialFavorite={isFavorite} className="absolute top-4 end-4" />

        {warrantyMonths > 0 && (
          <div className="bg-brand text-brand-foreground absolute top-4 start-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg">
            <ShieldCheck className="size-3.5" />
            אחריות {warrantyMonths} חודשים
          </div>
        )}

        {isAdmin && active?.sourcePageUrl && (
          <a
            href={active.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={[active.sourceDomain, active.capturedAt ? `נשמר ${new Date(active.capturedAt).toLocaleDateString("he-IL")}` : null]
              .filter(Boolean)
              .join(" · ")}
            className="bg-background/90 text-foreground hover:text-brand absolute bottom-3 start-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow"
          >
            <LinkIcon className="size-3" />
            {active.sourceDomain ?? "מקור התמונה"}
          </a>
        )}

        {isAdmin && isDraggingFile && (
          <div className="border-amber-400 bg-amber-500/25 pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-xl border-4 border-dashed text-white">
            <Upload className="size-8" />
            <span className="text-sm font-semibold">שחררו כאן להעלאת תמונה</span>
          </div>
        )}

        {isAdmin && isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <span className="text-sm font-semibold">מעלה תמונה...</span>
          </div>
        )}

        {isAdmin && !showAddInput && !isDraggingFile && !isUploading && (
          // No image yet: the click target is always visible — there's
          // nothing underneath it to obscure. With an image, it only shows
          // on hover so the actual photo stays visible by default.
          <button
            type="button"
            onClick={() => setShowAddInput(true)}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-2 text-white transition-opacity",
              active ? "bg-black/0 opacity-0 hover:bg-black/40 hover:opacity-100" : "bg-black/35"
            )}
          >
            <ImagePlus className="size-8" />
            <span className="text-sm font-semibold">
              {active ? "החלף / הוסף תמונה" : "לחצו להוספת תמונה, או גררו קובץ לכאן"}
            </span>
          </button>
        )}

        {isAdmin && showAddInput && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-6">
            <div className="bg-background w-full max-w-xs rounded-xl p-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">הוספת תמונה</span>
                <button
                  type="button"
                  onClick={() => setShowAddInput(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="סגור"
                >
                  <X className="size-4" />
                </button>
              </div>
              <input
                autoFocus
                value={addingUrl}
                onChange={(e) => setAddingUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setShowAddInput(false);
                }}
                placeholder="כתובת URL של התמונה"
                dir="ltr"
                className="border-input w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              />
              {error && <p className="text-destructive mt-1.5 text-xs">{error}</p>}
              <button
                type="button"
                onClick={handleAdd}
                disabled={isPending}
                className="bg-amber-500 mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <Plus className="size-4" /> הוסף תמונה
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Everyone gets the browsing strip once there's more than one photo
          to flip through — only admins additionally get the primary/remove
          controls on each thumb and the "+" tile to add more. This used to
          be isAdmin-only entirely, which meant a customer visiting the site
          could only ever see a product's first image, never its others. */}
      {(isAdmin || localImages.length > 1) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {localImages.map((img, i) => (
            <div
              key={img.id}
              className={cn(
                "group/thumb relative size-16 shrink-0 overflow-hidden rounded-lg border-2",
                i === activeIndex ? "border-amber-500" : "border-border"
              )}
            >
              <button type="button" onClick={() => setActiveIndex(i)} className="block size-full" aria-label="הצג תמונה זו">
                <Image src={img.url} alt="" fill className="object-cover" sizes="64px" referrerPolicy="no-referrer" />
              </button>
              {isAdmin &&
                (i === 0 ? (
                  <span
                    className="absolute top-0.5 start-0.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white"
                    title="תמונה ראשית"
                  >
                    <Star className="size-3" fill="currentColor" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={isPending}
                    className="absolute top-0.5 start-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                    aria-label="הגדר כתמונה ראשית"
                    title="הגדר כתמונה ראשית"
                  >
                    <Star className="size-3" />
                  </button>
                ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleRemove(img.id)}
                  disabled={isPending}
                  className="absolute top-0.5 end-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                  aria-label="הסר תמונה"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddInput(true)}
              className="border-border text-muted-foreground hover:border-amber-500 hover:text-amber-600 flex size-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors"
              aria-label="הוסף תמונה"
            >
              <Plus className="size-5" />
            </button>
          )}
        </div>
      )}
      {error && !showAddInput && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
