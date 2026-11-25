import type { Metadata } from "next";
import { CancelOrderForm } from "./cancel-order-form";

export const metadata: Metadata = {
  title: "ביטול עסקה",
  description: "טופס לביטול עסקה שבוצעה באתר Buy Today.",
  alternates: { canonical: "/cancel-order" },
};

export default function CancelOrderPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">ביטול עסקה</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        מלאו את הפרטים ונחזור אליכם תוך יום עסקים. לפרטים על התנאים: מדיניות ביטול והחזרות.
      </p>
      <CancelOrderForm />
    </div>
  );
}
