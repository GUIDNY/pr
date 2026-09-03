import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser, getSession } from "@/lib/auth";
import { pelecardEnabled } from "@/lib/pelecard/config";

export const metadata = { title: "תשלום" };

export default async function CheckoutPage() {
  const [user, session] = await Promise.all([getCurrentUser(), getSession()]);
  return (
    <CheckoutForm
      defaultName={user?.name}
      defaultEmail={user?.email}
      defaultPhone={user?.phone ?? undefined}
      // Server-only switch, resolved here and handed down: the form must never
      // read it, because anything the browser can see it can also change.
      payViaGateway={pelecardEnabled()}
      // The test lane. Resolved here for the same reason as the switch above:
      // a browser that can see the flag can also set it.
      isStaff={session?.role === "ADMIN" || session?.role === "STAFF"}
    />
  );
}
