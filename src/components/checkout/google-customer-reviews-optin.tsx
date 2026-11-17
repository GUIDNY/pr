"use client";

import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useConsent } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";
import { PAYMENT_CAPTURED_EVENT } from "@/components/analytics/meta-events";

/** Merchant Center account 5847431184 — public, it appears in Google's own
    survey URL. */
const MERCHANT_ID = 5847431184;

const noSubscribe = () => () => {};

type GapiSurveyOptIn = {
  load: (name: "surveyoptin", cb: () => void) => void;
  surveyoptin: {
    render: (opts: {
      merchant_id: number;
      order_id: string;
      email: string;
      delivery_country: string;
      estimated_delivery_date: string;
      opt_in_style?: string;
    }) => void;
  };
};

declare global {
  interface Window {
    gapi?: GapiSurveyOptIn;
    renderOptIn?: () => void;
    ___gcfg?: { lang?: string };
  }
}

/**
 * Google Customer Reviews: the "would you rate this shop?" box Google shows on
 * an order confirmation. A customer who says yes gets one email from Google
 * after `estimatedDeliveryDate`; the ratings that come back are what puts
 * seller stars on Shopping.
 *
 * Only after a payment that went through. A Pelecard order often lands here
 * before the gateway's callback, so `paid` is false at first render and this
 * waits for PaymentConfirmation's PAYMENT_CAPTURED_EVENT — the same signal
 * the purchase pixels wait for. A payment that fails never fires it.
 *
 * Sends Google exactly the five fields the survey needs — the merchant id,
 * the order number, the customer's email, the country and the date — and
 * nothing else: no name, phone, address, items or amounts.
 *
 * Behind the cookie consent like every other third-party script here, and
 * never inside the iOS app (see cookie-notice.tsx). Shown once per order per
 * browser, so a reload does not ask again.
 */
export function GoogleCustomerReviewsOptIn({
  orderNumber,
  email,
  estimatedDeliveryDate,
  paid,
}: {
  orderNumber: string;
  email: string;
  estimatedDeliveryDate: string;
  paid: boolean;
}) {
  const consent = useConsent();
  const inApp = useIsNativeApp();
  const [captured, setCaptured] = useState(paid);
  const key = `prec-gcr-optin:${orderNumber}`;
  // Read once on the client; the server render assumes "asked" so nothing loads before hydration.
  const alreadyAsked = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );

  useEffect(() => {
    if (captured) return;
    const onCaptured = (e: Event) => {
      if ((e as CustomEvent<{ orderNumber?: string }>).detail?.orderNumber === orderNumber) setCaptured(true);
    };
    window.addEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(PAYMENT_CAPTURED_EVENT, onCaptured);
  }, [captured, orderNumber]);

  const show = captured && !alreadyAsked && consent === "granted" && !inApp && Boolean(email);

  useEffect(() => {
    if (!show) return;
    window.___gcfg = { lang: "iw" };
    window.renderOptIn = () => {
      window.gapi?.load("surveyoptin", () => {
        window.gapi?.surveyoptin.render({
          merchant_id: MERCHANT_ID,
          order_id: orderNumber,
          email,
          delivery_country: "IL",
          estimated_delivery_date: estimatedDeliveryDate,
          opt_in_style: "CENTER_DIALOG",
        });
        try {
          window.localStorage.setItem(key, "1");
        } catch {
          /* storage blocked: the box may show again on a reload */
        }
      });
    };
    // The script may already be on the page from an earlier render.
    if (window.gapi?.load) window.renderOptIn();
  }, [show, orderNumber, email, estimatedDeliveryDate, key]);

  if (!show) return null;
  return (
    <Script
      id="google-customer-reviews"
      src="https://apis.google.com/js/platform.js?onload=renderOptIn"
      strategy="afterInteractive"
    />
  );
}
