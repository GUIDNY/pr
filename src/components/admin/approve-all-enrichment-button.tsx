"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveAllEnrichmentCandidatesAction } from "@/actions/admin-enrichment";

export function ApproveAllEnrichmentButton({ count }: { count: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function approveAll() {
    if (!confirm(`לאשר את כל ${count} המועמדים הממתינים? הפעולה תעדכן את כל המוצרים בבת אחת.`)) return;
    startTransition(async () => {
      const result = await approveAllEnrichmentCandidatesAction();
      if (result.failed > 0) toast.warning(`אושרו ${result.approved}, נכשלו ${result.failed}`);
      else toast.success(`אושרו ${result.approved} מועמדים`);
      router.refresh();
    });
  }

  if (count === 0) return null;

  return (
    <Button variant="brand" size="sm" onClick={approveAll} disabled={isPending} className="gap-1.5">
      <CheckCheck className="size-4" />
      {isPending ? "מאשר..." : `אשר הכל (${count})`}
    </Button>
  );
}
