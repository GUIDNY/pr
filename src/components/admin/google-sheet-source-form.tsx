"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGoogleSheetSourceAction } from "@/actions/admin-inventory";
import { CATEGORY_TREE } from "@/lib/category-tree";

export function GoogleSheetSourceForm() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      className="border-border bg-card grid gap-3 rounded-xl border p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await addGoogleSheetSourceAction(formData);
          if (result.success) {
            toast.success("הגליון חובר בהצלחה");
            formRef.current?.reset();
            router.refresh();
          } else {
            toast.error(result.error ?? "החיבור נכשל");
          }
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="gsheet-name">שם המקור</Label>
        <Input id="gsheet-name" name="name" placeholder='למשל: "מכונות קפה"' required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="gsheet-url">קישור לגליון Google Sheets</Label>
        <Input id="gsheet-url" name="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/..." required />
        <p className="text-muted-foreground text-xs">
          השיתוף חייב להיות מוגדר ל&quot;כל מי שיש לו את הקישור - צופה&quot;
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gsheet-category">קטגוריה (הגליון כולו)</Label>
        <select
          id="gsheet-category"
          name="categorySlug"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">— ללא (יידרש עדכון ידני) —</option>
          {CATEGORY_TREE.map((dept) => (
            <optgroup key={dept.slug} label={dept.name}>
              {dept.children.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
          <Link2 className="size-3.5" />
          {isPending ? "מתחבר..." : "חבר גליון"}
        </Button>
      </div>
    </form>
  );
}
