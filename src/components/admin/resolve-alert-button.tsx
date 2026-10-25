"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveAlertAction } from "@/actions/admin-inventory";

export function ResolveAlertButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      className="shrink-0 gap-1.5"
      /* The refusal has to be said out loud. Some alerts cannot be closed
         while the thing they describe is still readable in the database —
         see alertEvidenceStillStands — and a button that silently does
         nothing reads as a broken button, which is how somebody ends up
         clicking it four times and then editing the row by hand. */
      onClick={() =>
        startTransition(async () => {
          const result = await resolveAlertAction(id);
          if (result?.error) toast.error(result.error, { duration: 12_000 });
          router.refresh();
        })
      }
    >
      <Check className="size-3.5" />
      טופל
    </Button>
  );
}
