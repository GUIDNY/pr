"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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
      onClick={() => startTransition(async () => { await resolveAlertAction(id); router.refresh(); })}
    >
      <Check className="size-3.5" />
      טופל
    </Button>
  );
}
