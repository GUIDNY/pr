/* Ids shared by the product page (a server component) and the client
   helpers in components/product/pdp-jump.tsx. Plain module on purpose: a
   function exported from a "use client" file cannot be called while the
   server renders, and on 15 November doing exactly that put every product
   page on 500 until it was reverted. */
export const PDP_TABS_ID = "pdp-tabs";

export function pdpTabTriggerId(value: string) {
  return `pdp-tab-${value}`;
}
