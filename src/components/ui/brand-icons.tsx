/**
 * Instagram and Facebook marks, drawn here rather than imported.
 *
 * lucide-react shipped both until it removed every brand glyph over
 * trademark, and this project is on v1.31 — `import { Instagram } from
 * "lucide-react"` does not compile. Installing a second icon package for two
 * shapes is not worth the dependency, and `npm install` does not run in this
 * sandbox anyway (see CLAUDE.md), so the two paths live here.
 *
 * They are Lucide's own outlines, kept stroked rather than swapped for the
 * networks' filled logos: the footer's icons are all one weight, and a solid
 * corporate logo dropped among them reads as an advert rather than as a link.
 *
 * `currentColor` and no explicit size — every caller styles them with the
 * same `size-*` and colour classes it gives a lucide icon, so they stay
 * interchangeable with the ones around them.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
