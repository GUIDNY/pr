"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadInventorySourceAction } from "@/actions/admin-inventory";

export function SourceUploadForm({ sourceKey }: { sourceKey: string }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await uploadInventorySourceAction(formData);
          if (result.success) {
            toast.success("הקובץ הועלה בהצלחה");
            formRef.current?.reset();
            router.refresh();
          } else {
            toast.error(result.error ?? "ההעלאה נכשלה");
          }
        });
      }}
    >
      <input type="hidden" name="key" value={sourceKey} />
      <Input type="file" name="file" accept=".xlsx,.xls" required className="max-w-xs" />
      <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
        <Upload className="size-3.5" />
        {isPending ? "מעלה..." : "העלאה / החלפה"}
      </Button>
    </form>
  );
}
