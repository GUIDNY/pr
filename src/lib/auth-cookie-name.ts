// Split out of lib/auth.ts so a client component can import the name without
// pulling in jose, the signing key and next/headers — none of which can exist
// in a browser bundle.
export const DISPLAY_NAME_COOKIE = "prec_name";
