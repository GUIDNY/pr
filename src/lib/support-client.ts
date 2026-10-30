"use client";

import { submitSupportRequestAction } from "@/actions/support";
import { pushEvent } from "@/lib/analytics/ga";
import { trackMeta } from "@/lib/analytics/meta";
import { trackVisit } from "@/lib/pageview/track";

/**
 * A support request, reported as the lead it is — the same arrangement as
 * addToCartReported in cart-client.ts: the two forms (the contact page,
 * "בקשו שיחזרו אליי" on a product) call this and not the action, so a form
 * added later is counted by calling the one function. Reported only on
 * success: a refused form is not an enquiry. What is reported is the form
 * and the channel the customer asked for, never the name or the phone.
 */
export async function submitSupportRequestReported(input: Parameters<typeof submitSupportRequestAction>[0]) {
  const result = await submitSupportRequestAction(input);
  if (result.success) {
    pushEvent("form_submit", { form_name: input.channel.toLowerCase(), page_path: window.location.pathname });
    trackMeta("Lead", { content_name: input.channel.toLowerCase() });
    trackVisit("form_submit", { form: input.channel.toLowerCase(), channel: input.channel.toLowerCase() });
  }
  return result;
}
