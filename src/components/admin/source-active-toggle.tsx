"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toggleSourceActiveAction } from "@/actions/admin-inventory";

export function SourceActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{isActive ? "פעיל" : "לא פעיל"}</span>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await toggleSourceActiveAction(id, checked);
            router.refresh();
          })
        }
      />
    </div>
  );
}
