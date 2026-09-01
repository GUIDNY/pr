import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser } from "@/lib/auth";
import { pelecardEnabled } from "@/lib/pelecard/config";

export const metadata = { title: "תשלום" };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  return (
    <CheckoutForm
      defaultName={user?.name}
      defaultEmail={user?.email}
      defaultPhone={user?.phone ?? undefined}
      // Server-only switch, resolved here and handed down: the form must never
      // read it, because anything the browser can see it can also change.
      payViaGateway={pelecardEnabled()}
    />
  );
}
