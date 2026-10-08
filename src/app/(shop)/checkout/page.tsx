import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { canManageCatalog } from "@/lib/permissions";
import { googleOAuthConfigured, googleNativeConfigured } from "@/lib/google-oauth";
import { appleOAuthConfigured, appleNativeConfigured } from "@/lib/apple-oauth";
import { walletBalanceAgorot, walletEnabled } from "@/lib/wallet";

export const metadata = { title: "תשלום" };

export default async function CheckoutPage() {
  const [user, session] = await Promise.all([getCurrentUser(), getSession()]);

  /* The address the account already has. It was the one thing checkout did not
     hand down, so a returning customer with a delivery address on file still
     met three empty fields and had to type it again — and with the card form
     opening as soon as the details are complete, "again" meant before anything
     could happen at all.

     Most recently marked default, and only for a signed-in viewer: a guest has
     no account to read one from. */
  const savedAddress = user
    ? await db.address.findFirst({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { id: "desc" }],
        select: { city: true, street: true, houseNo: true, apartment: true, phone: true },
      })
    : null;

  /* The BuyToday balance, for a signed-in viewer while the feature is on.
     Only read behind the flag: with it off the tables may not exist yet. The
     form uses it to offer "תשלום מהיתרה"; the order action checks it again. */
  const walletAgorot = user && walletEnabled() ? await walletBalanceAgorot(user.id) : null;
  return (
    <CheckoutForm
      // A guest is offered one-tap sign-in above the contact fields: with an
      // account the three fields fill themselves, without one a tap makes
      // one. Server-side, like the login page, because whether Google is
      // configured is not a question for the browser.
      signedIn={!!user}
      googleEnabled={googleOAuthConfigured()}
      appleEnabled={appleOAuthConfigured()}
      // The app cannot run the web OAuth redirect, so inside it the same strip
      // offers the native sheets instead — the pair the login page uses.
      googleNativeEnabled={googleNativeConfigured()}
      appleNativeEnabled={appleNativeConfigured()}
      defaultName={user?.name}
      defaultEmail={user?.email}
      defaultPhone={user?.phone ?? savedAddress?.phone ?? undefined}
      defaultWhatsappOptIn={user?.whatsappOptIn ?? true}
      defaultMarketingOptIn={user?.marketingOptIn ?? false}
      defaultCity={savedAddress?.city ?? undefined}
      defaultStreet={savedAddress?.street ?? undefined}
      defaultHouseNo={savedAddress?.houseNo ?? undefined}
      defaultApartment={savedAddress?.apartment ?? undefined}
      // Server-only, resolved here and handed down: the form must never read
      // it, because anything the browser can see it can also change. The
      // address comes from getCurrentUser() — the account on the signed cookie
      // — and never from the email field on the form itself.
      payViaGateway={paymentLaneFor({ email: user?.email, role: session?.role }) === "gateway"}
      // The test lane. Resolved here for the same reason as the switch above:
      // a browser that can see the flag can also set it.
      isStaff={canManageCatalog(session?.role)}
      /* The details stay editable after the card form opens, for everyone.
         They were frozen for guests, because the sync action would only follow
         an order with a signed-in owner — which meant a guest who spotted a
         typo in their own address with the card form open could do nothing
         about it but abandon the order. Most people here check out without an
         account, so that was most people. The action now accepts a guest who
         holds this browser's receipt for the order. */
      canEditWhilePaying
      walletAgorot={walletAgorot}
    />
  );
}
