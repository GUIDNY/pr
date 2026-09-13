"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Package, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PromoCarousel, type PromoSlide } from "@/components/home/promo-carousel";
import { searchProductsAction, type SearchResult } from "@/actions/search";
import { saveBannersAction, uploadBannerImageAction } from "@/actions/admin-banners";
import {
  showsOnDesktop,
  showsOnPhone,
  BANNER_TONES,
  BANNER_TONE_LABELS,
  MAX_BANNERS,
  MAX_BANNER_IMAGES,
  newBannerId,
  type Banner,
} from "@/lib/banners";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The owner's banner editor. Each banner is a card: the words, the colour,
 * where a tap goes (a product picked by name, or any link), up to three
 * photographs (a product's own, an upload, or a URL), on/off, and its
 * place in the order — with the slide drawn live beside the fields, by the
 * same component the homepage uses, so what is saved is what is shown.
 */
export function BannerManager({ initialBanners }: { initialBanners: Banner[] }) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [isPending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  function update(id: string, patch: Partial<Banner>) {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty(true);
  }
  function move(id: string, dir: -1 | 1) {
    setBanners((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }
  function remove(id: string) {
    setBanners((prev) => prev.filter((b) => b.id !== id));
    setDirty(true);
  }
  function add() {
    if (banners.length >= MAX_BANNERS) {
      toast.error(`אפשר עד ${MAX_BANNERS} באנרים`);
      return;
    }
    setBanners((prev) => [
      ...prev,
      // Shown from the start: a banner made and saved but never switched on
      // is the one way to "not see it on the site" that the page cannot
      // explain to the person who built it.
      { id: newBannerId(), layout: "collage", title: "", body: "", href: "/deals", tone: "brand", images: [], isActive: true },
    ]);
    setDirty(true);
  }
  function save() {
    startTransition(async () => {
      const result = await saveBannersAction(banners);
      if (result.success) {
        const shown = banners.filter((b) => b.isActive).length;
        if (banners.length > 0 && shown === 0) {
          toast.warning("נשמר, אבל אף באנר לא מסומן \"מוצג באתר\" — האתר ממשיך להציג את הבאנר האוטומטי", { duration: 8000 });
        } else toast.success(shown > 0 ? `נשמר — ${shown} באנרים מוצגים באתר` : "הבאנרים נשמרו");
        setDirty(false);
      } else toast.error(result.error ?? "שגיאה בשמירה");
    });
  }

  const active = banners.filter((b) => b.isActive);
  const onPhone = active.filter(showsOnPhone);
  const onDesktop = active.filter(showsOnDesktop);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">באנרים — דף הבית</h1>
          <p className="text-muted-foreground text-sm">
            מה שמופיע בבאנר המתחלף בראש דף הבית. הסדר כאן הוא הסדר באתר; רק באנרים פעילים מוצגים. בלי באנרים
            פעילים האתר מציג לבד את ההנחה הגבוהה של היום ואת כלל המשלוח.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={add} disabled={banners.length >= MAX_BANNERS}>
            <Plus className="size-4" /> באנר חדש
          </Button>
          <Button variant="brand" size="sm" onClick={save} disabled={isPending || !dirty}>
            {isPending ? "שומר..." : "שמירה"}
          </Button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="border-border bg-card mb-6 grid grid-cols-1 gap-6 rounded-xl border p-4 lg:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-3 text-sm font-medium">בטלפון ({onPhone.length} מתוך {active.length} הפעילים):</p>
            {onPhone.length > 0 ? (
              <div className="mx-auto max-w-sm">
                <PromoCarousel slides={onPhone.map((b) => toSlide(b, "phone"))} compact slogan="הדרך החכמה לקנות אלקטרוניקה" intervalMs={4000} />
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">לאף באנר פעיל אין תמונה לטלפון — הטלפון מציג את הבאנר האוטומטי.</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground mb-3 text-sm font-medium">במחשב, בכרטיס שבצד הכותרת ({onDesktop.length} מתוך {active.length}):</p>
            {onDesktop.length > 0 ? (
              <div className="bg-primary rounded-xl p-4">
                <PromoCarousel slides={onDesktop.map((b) => toSlide(b, "desktop"))} stacked intervalMs={4000} className="mx-auto max-w-[22rem] shadow-xl" />
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">לאף באנר פעיל אין תמונה למחשב — המחשב מציג את הבאנר האוטומטי.</p>
            )}
          </div>
        </div>
      )}

      {banners.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין באנרים עדיין. לחצו על &quot;באנר חדש&quot; כדי להוסיף את הראשון.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {banners.map((b, i) => (
            <BannerCard
              key={b.id}
              banner={b}
              index={i}
              count={banners.length}
              onChange={(patch) => update(b.id, patch)}
              onMove={(dir) => move(b.id, dir)}
              onRemove={() => remove(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function toSlide(b: Banner, device: "phone" | "desktop"): PromoSlide {
  if (b.layout === "image") {
    const src = device === "phone" ? b.images[0] : b.desktopImage;
    return src
      ? { kind: "image", src, alt: b.title || b.body, href: b.href }
      : { kind: "promo", title: "העלו תמונה", body: device === "phone" ? "לטלפון" : "למחשב", href: b.href, tone: "light", images: [] };
  }
  return { kind: "promo", title: b.title || "כותרת", body: b.body, href: b.href, tone: b.tone, images: b.images };
}

/** Downscales to at most `max` px on the long side, as JPEG, in the browser. */
async function shrinkImage(file: File, max: number): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("הקובץ שנבחר אינו תמונה");
  // GIFs and SVGs would lose animation / vectors; send small ones as they are.
  if (/gif|svg/.test(file.type) && file.size < 2 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  const type = hasAlpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + (hasAlpha ? ".png" : ".jpg");
  return new File([blob], name, { type });
}

function BannerCard({
  banner,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  banner: Banner;
  index: number;
  count: number;
  onChange: (patch: Partial<Banner>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [uploading, setUploading] = useState<false | "wide" | "desktop">(false);
  const desktopRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageOnly = banner.layout === "image";
  const maxImages = imageOnly ? 1 : MAX_BANNER_IMAGES;

  function onQuery(v: string) {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      startSearch(async () => setResults(await searchProductsAction(v)));
    }, 300);
  }

  function pickProduct(p: SearchResult) {
    const patch: Partial<Banner> = { href: `/product/${p.slug}` };
    if (!imageOnly && p.imageUrl && banner.images.length < maxImages && !banner.images.includes(p.imageUrl)) {
      patch.images = [...banner.images, p.imageUrl];
    }
    onChange(patch);
    setQuery("");
    setResults([]);
    toast.success(`היעד: ${p.title}`);
  }

  function addImageUrl() {
    const u = imageUrl.trim();
    if (!u) return;
    if (banner.images.length >= maxImages) {
      toast.error(`עד ${maxImages} תמונות לבאנר`);
      return;
    }
    onChange({ images: [...banner.images, u] });
    setImageUrl("");
  }

  async function upload(files: FileList | null, target: "wide" | "desktop" = "wide") {
    if (!files || files.length === 0) return;
    if (target === "wide" && banner.images.length >= maxImages) {
      toast.error(`עד ${maxImages} תמונות לבאנר`);
      return;
    }
    setUploading(target);
    try {
      // Shrunk in the browser first: a phone photograph is 4–8MB and a
      // banner is shown at most ~1300px wide, so sending the original
      // only made the upload slow and, past the action body limit, fail.
      const file = await shrinkImage(files[0], 1600);
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadBannerImageAction(fd);
      if (result.success && result.url) {
        onChange(target === "desktop" ? { desktopImage: result.url } : { images: [...banner.images, result.url] });
      } else toast.error(result.error ?? "העלאה נכשלה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "העלאה נכשלה");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (desktopRef.current) desktopRef.current.value = "";
    }
  }

  return (
    <div className={cn("border-border bg-card rounded-xl border p-4", !banner.isActive && "opacity-80")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums">
            {index + 1}
          </span>
          <Label className="flex items-center gap-2 text-sm">
            <Switch checked={banner.isActive} onCheckedChange={(v) => onChange({ isActive: v })} />
            {banner.isActive ? (
              <span className="text-brand font-semibold">מוצג באתר</span>
            ) : (
              <span className="text-destructive font-semibold">מוסתר — לא מוצג באתר</span>
            )}
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="הזז למעלה">
            <ArrowUp className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="הזז למטה">
            <ArrowDown className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="מחק" className="text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block">סוג הבאנר</Label>
            <div className="flex gap-2">
              {(
                [
                  ["collage", "טקסט + תמונות מוצר"],
                  ["image", "תמונה מעוצבת בלבד"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ layout: value, images: banner.images.slice(0, value === "image" ? 1 : MAX_BANNER_IMAGES) })}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    banner.layout === value ? "border-brand ring-brand/30 ring-2" : "border-border"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {imageOnly && (
              <p className="text-muted-foreground mt-1.5 text-xs">
                רק התמונה, בלי טקסט או מסגרת מעליה. לטלפון תמונה רחבה (1600×700), למחשב תמונה ריבועית (1000×1000) לכרטיס שבצד
                הכותרת. אפשר להעלות רק אחת מהן — אז הבאנר מופיע רק במכשיר שיש לו תמונה, ולא נחתך למכשיר השני. הכותרת למטה משמשת
                רק כתיאור לקוראי מסך.
              </p>
            )}
          </div>

          <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", imageOnly && "sm:grid-cols-1")}>
            <div>
              <Label htmlFor={`t-${banner.id}`} className="mb-1.5">{imageOnly ? "תיאור התמונה (לא מוצג)" : "כותרת (גדול)"}</Label>
              <Input id={`t-${banner.id}`} value={banner.title} maxLength={40} placeholder={imageOnly ? 'למשל: "מבצע מקררים ספטמבר"' : 'למשל: "20% הנחה על מקררים"'} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            {!imageOnly && (
              <div>
                <Label htmlFor={`b-${banner.id}`} className="mb-1.5">טקסט משני</Label>
                <Input id={`b-${banner.id}`} value={banner.body} maxLength={60} placeholder='למשל: "עד סוף החודש"' onChange={(e) => onChange({ body: e.target.value })} />
              </div>
            )}
          </div>

          <div className={cn(imageOnly && "hidden")}>
            <Label className="mb-1.5 block">צבע</Label>
            <div className="flex gap-2">
              {BANNER_TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ tone: t })}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                    banner.tone === t ? "border-brand ring-brand/30 ring-2" : "border-border"
                  )}
                >
                  <span
                    className={cn(
                      "size-4 rounded-full border",
                      t === "brand" && "bg-brand border-brand",
                      t === "light" && "border-border bg-white",
                      t === "navy" && "bg-primary border-primary"
                    )}
                  />
                  {BANNER_TONE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">לאן לחיצה מובילה</Label>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
                <Input value={banner.href} onChange={(e) => onChange({ href: e.target.value })} className="ps-9 font-mono text-xs" dir="ltr" placeholder="/deals" />
              </div>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
                <Input value={query} onChange={(e) => onQuery(e.target.value)} className="ps-9" placeholder="או חפשו מוצר לפי שם ובחרו אותו כיעד..." />
                {(results.length > 0 || searching) && query.trim().length >= 2 && (
                  <div className="border-border bg-popover absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg">
                    {searching && results.length === 0 ? (
                      <p className="text-muted-foreground p-3 text-sm">מחפש...</p>
                    ) : (
                      results.slice(0, 8).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickProduct(p)}
                          className="hover:bg-muted flex w-full items-center gap-3 px-3 py-2 text-start"
                        >
                          <span className="bg-muted relative size-9 shrink-0 overflow-hidden rounded-md">
                            {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="36px" className="object-contain bg-white" /> : <Package className="m-2 size-5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{p.title}</span>
                            <span className="text-muted-foreground text-xs">{formatPrice(p.price)}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={cn(imageOnly && "grid grid-cols-1 gap-4 sm:grid-cols-2")}>
            <div>
              <Label className="mb-1.5 block">{imageOnly ? "תמונה לטלפון (רחבה, 1600×700)" : `תמונות (עד ${MAX_BANNER_IMAGES})`}</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {banner.images.map((src, i) => (
                  <span key={src + i} className={cn("border-border relative overflow-hidden rounded-lg border bg-white", imageOnly ? "h-24 w-52" : "size-20")}>
                    <Image src={src} alt="" fill sizes="208px" className={imageOnly ? "object-cover" : "object-contain p-1"} />
                    <button
                      type="button"
                      onClick={() => onChange({ images: banner.images.filter((_, j) => j !== i) })}
                      className="bg-background/90 hover:text-destructive absolute top-1 end-1 rounded-full p-0.5 shadow"
                      aria-label="הסר תמונה"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {banner.images.length < maxImages && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading !== false}
                    className={cn(
                      "border-border text-muted-foreground hover:border-brand hover:text-brand flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px]",
                      imageOnly ? "h-24 w-52" : "size-20"
                    )}
                  >
                    <ImagePlus className="size-5" />
                    {uploading === "wide" ? "מעלה..." : "העלאה"}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files)} />
              </div>
              {!imageOnly && (
                <div className="flex gap-2">
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} dir="ltr" className="font-mono text-xs" placeholder="https://... כתובת תמונה" />
                  <Button type="button" variant="outline" size="sm" onClick={addImageUrl} disabled={!imageUrl.trim()}>
                    הוסף
                  </Button>
                </div>
              )}
              {imageOnly && banner.images.length === 0 && <p className="text-muted-foreground text-xs">בלי תמונה לטלפון הבאנר לא יופיע בטלפון.</p>}
            </div>

            {imageOnly && (
              <div>
                <Label className="mb-1.5 block">תמונה למחשב (ריבוע, 1000×1000)</Label>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {banner.desktopImage ? (
                    <span className="border-border relative size-24 overflow-hidden rounded-lg border bg-white">
                      <Image src={banner.desktopImage} alt="" fill sizes="96px" className="object-cover" />
                      <button
                        type="button"
                        onClick={() => onChange({ desktopImage: undefined })}
                        className="bg-background/90 hover:text-destructive absolute top-1 end-1 rounded-full p-0.5 shadow"
                        aria-label="הסר תמונה למחשב"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => desktopRef.current?.click()}
                      disabled={uploading !== false}
                      className="border-border text-muted-foreground hover:border-brand hover:text-brand flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px]"
                    >
                      <ImagePlus className="size-5" />
                      {uploading === "desktop" ? "מעלה..." : "העלאה"}
                    </button>
                  )}
                  <input ref={desktopRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files, "desktop")} />
                </div>
                {!banner.desktopImage && <p className="text-muted-foreground text-xs">בלי תמונה למחשב הבאנר לא יופיע במחשב.</p>}
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">{imageOnly ? "בטלפון" : "תצוגה מקדימה"}</p>
          {!imageOnly || banner.images[0] ? (
            <PromoCarousel slides={[toSlide(banner, "phone")]} compact slogan="הדרך החכמה לקנות אלקטרוניקה" />
          ) : (
            <p className="text-muted-foreground text-xs">אין תמונה לטלפון — לא מופיע בטלפון.</p>
          )}
          {imageOnly && (
            <div className="mt-4">
              <p className="text-muted-foreground mb-2 text-xs font-medium">במחשב, בכרטיס שבצד הכותרת</p>
              {banner.desktopImage ? (
                <div className="bg-primary rounded-xl p-4">
                  <PromoCarousel slides={[toSlide(banner, "desktop")]} stacked className="mx-auto max-w-[22rem] shadow-xl" />
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">אין תמונה למחשב — לא מופיע במחשב.</p>
              )}
            </div>
          )}
          {!banner.isActive && <p className="text-destructive mt-2 text-xs font-medium">הבאנר מוסתר. הפעילו את המתג למעלה ושמרו כדי שיופיע באתר.</p>}
        </div>
      </div>
    </div>
  );
}
