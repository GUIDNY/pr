import {
  Tv,
  Speaker,
  Refrigerator,
  WashingMachine,
  Utensils,
  Flame,
  Coffee,
  Sparkles,
  Wind,
  Thermometer,
  Laptop,
  Scissors,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Tv,
  Speaker,
  Refrigerator,
  WashingMachine,
  Utensils,
  Flame,
  Coffee,
  Sparkles,
  Wind,
  Thermometer,
  Laptop,
  Scissors,
  Package,
};

// Deterministic hue offset from the product title so a category renders a
// consistent-but-varied family of tiles instead of one flat block color.
function hueOffset(seedText: string) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) % 360;
  return hash;
}

export function ProductImagePlaceholder({
  title,
  brand,
  icon,
  className,
}: {
  title: string;
  brand?: string;
  icon?: string | null;
  className?: string;
}) {
  const Icon = (icon && ICONS[icon]) || Package;
  const hue = hueOffset(title);

  return (
    <div
      className={cn("relative flex size-full items-center justify-center overflow-hidden", className)}
      style={{
        background: `linear-gradient(135deg, oklch(0.94 0.025 ${hue}) 0%, oklch(0.88 0.035 ${hue}) 100%)`,
      }}
    >
      <Icon
        className="text-foreground/15 absolute -bottom-3 -end-3 size-2/3"
        strokeWidth={1}
        aria-hidden
      />
      {brand && (
        <span className="text-foreground/40 absolute top-2 start-2 text-[10px] font-bold tracking-wide uppercase">
          {brand}
        </span>
      )}
      <Icon className="text-foreground/30 relative size-1/3" strokeWidth={1.25} aria-hidden />
    </div>
  );
}
