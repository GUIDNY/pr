import {
  AirVent,
  Coffee,
  CookingPot,
  Heater,
  Laptop,
  Package,
  Refrigerator,
  Scissors,
  Speaker,
  Sparkles,
  Tv,
  Utensils,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One department, one small coloured tile: a soft tint behind a line icon
 * in a deeper shade of the same hue, the way the category rows of a
 * shopping app read at a glance — cold things blue, hot things warm, the
 * home green. Each hue is its own so the eye can find a line without
 * reading, and each stays pastel so the list beside the banner is not
 * louder than the banner.
 */
type Look = { icon: LucideIcon; tile: string; ink: string };

const LOOKS: Record<string, Look> = {
  "tv-multimedia": { icon: Tv, tile: "bg-indigo-50", ink: "text-indigo-600" },
  "audio-home-theater": { icon: Speaker, tile: "bg-violet-50", ink: "text-violet-600" },
  refrigeration: { icon: Refrigerator, tile: "bg-sky-50", ink: "text-sky-600" },
  laundry: { icon: WashingMachine, tile: "bg-cyan-50", ink: "text-cyan-700" },
  dishwashers: { icon: Utensils, tile: "bg-teal-50", ink: "text-teal-700" },
  "ovens-cooktops": { icon: CookingPot, tile: "bg-orange-50", ink: "text-orange-600" },
  "small-kitchen-appliances": { icon: Coffee, tile: "bg-amber-50", ink: "text-amber-700" },
  "home-appliances": { icon: Sparkles, tile: "bg-lime-50", ink: "text-lime-700" },
  "air-conditioning": { icon: AirVent, tile: "bg-blue-50", ink: "text-blue-600" },
  "heating-ventilation": { icon: Heater, tile: "bg-rose-50", ink: "text-rose-600" },
  "computers-communication": { icon: Laptop, tile: "bg-slate-100", ink: "text-slate-700" },
  "personal-care": { icon: Scissors, tile: "bg-pink-50", ink: "text-pink-600" },
};

const FALLBACK: Look = { icon: Package, tile: "bg-muted", ink: "text-muted-foreground" };

export function departmentLook(slug: string): Look {
  return LOOKS[slug] ?? FALLBACK;
}

export function DepartmentIcon({
  slug,
  size = "sm",
  className,
}: {
  slug: string;
  // sm: a 28px tile for a list row. lg: a 56px tile for a panel header.
  size?: "sm" | "lg";
  className?: string;
}) {
  const look = departmentLook(slug);
  const Icon = look.icon;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center transition-transform group-hover:scale-105",
        size === "sm" ? "size-7 rounded-lg" : "size-14 rounded-2xl",
        look.tile,
        look.ink,
        className
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-7"} strokeWidth={size === "sm" ? 1.9 : 1.6} />
    </span>
  );
}
