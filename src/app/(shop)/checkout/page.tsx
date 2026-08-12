import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "תשלום" };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  return (
    <CheckoutForm defaultName={user?.name} defaultEmail={user?.email} defaultPhone={user?.phone ?? undefined} />
  );
}
