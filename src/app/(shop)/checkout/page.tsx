import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser, getSession } from "@/lib/auth";
import { paymentLaneFor } from "@/lib/pelecard/config";

export const metadata = { title: "תשלום" };

export default async function CheckoutPage() {
  const [user, session] = await Promise.all([getCurrentUser(), getSession()]);
  return (
    <CheckoutForm
      defaultName={user?.name}
      defaultEmail={user?.email}
      defaultPhone={user?.phone ?? undefined}
      // Server-only, resolved here and handed down: the form must never read
      // it, because anything the browser can see it can also change. The
      // address comes from getCurrentUser() — the account on the signed cookie
      // — and never from the email field on the form itself.
      payViaGateway={paymentLaneFor(user?.email) === "gateway"}
      // The test lane. Resolved here for the same reason as the switch above:
      // a browser that can see the flag can also set it.
      isStaff={session?.role === "ADMIN" || session?.role === "STAFF"}
    />
  );
}
