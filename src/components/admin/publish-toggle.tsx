"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toggleProductPublishAction } from "@/actions/admin-inventory";

export function PublishToggle({ id, isPublished }: { id: string; isPublished: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isPublished}
        disabled={isPending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await toggleProductPublishAction(id, checked);
            router.refresh();
          })
        }
      />
      <span className="text-sm">{isPublished ? "מפורסם באתר" : "לא מפורסם"}</span>
    </div>
  );
}
