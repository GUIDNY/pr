// Single source of real, structured product facts — feeds both the compact
// key-facts strip and the "why choose this product" cards on the product
// page, so there's exactly one place that decides what counts as a
// headline fact, not two copies of the same logic. Pulls only from real
// data (CategoryAttribute values first, extraSpecsRaw as a fallback) —
// never invents a fact a product doesn't actually have.

export type KeyFactIcon = "capacity" | "cold" | "energy" | "noise" | "color" | "dimension" | "power" | "generic";

export type KeyFact = { label: string; value: string; icon: KeyFactIcon };

function pickIcon(label: string, key?: string): KeyFactIcon {
  const text = `${label} ${key ?? ""}`.toLowerCase();
  if (/ליטר|נפח|capacity|volume/.test(text)) return "capacity";
  if (/קרח|frost|קירור|הקפא|טמפרטורה/.test(text)) return "cold";
  if (/אנרג|energy|דירוג/.test(text)) return "energy";
  if (/רעש|db\b|noise/.test(text)) return "noise";
  if (/צבע|color|גימור/.test(text)) return "color";
  if (/מידות|גובה|רוחב|עומק|dimension|גודל/.test(text)) return "dimension";
  if (/וואט|watt|הספק|power|צריכת/.test(text)) return "power";
  return "generic";
}

// Real scraped values sometimes already carry their own unit as text
// ("61 ס״מ", "86-120 סמ", the combined "33×21×32 ס\"מ (...)" string) —
// appending the attribute's own `unit` field on top of those duplicates it
// ("1.3 ליטר ליטר", confirmed on a real coffee-machine water tank value).
// Only a bare number ("7", "1.3") is actually missing its unit.
function formatValue(value: string, unit: string | null): string {
  const isBareNumber = /^\d+(\.\d+)?$/.test(value.trim());
  return unit && isBareNumber ? `${value} ${unit}` : value;
}

// Dimension-family attributes get their own dedicated section
// (ProductDimensions) now, so they're excluded here to avoid showing the
// same fact twice — once as a headline "key fact" chip and again in the
// מידות section. Exported so the specs-tab grouping (ProductSpecsEditor)
// can classify the same attributes into its "מידות" group without
// re-implementing the same pattern.
export const DIMENSION_PATTERN = /גובה|רוחב|עומק|משקל|מידות|height|width|depth|weight|dimension/i;

// Meta-fields that show up in a lot of scraped extraSpecsRaw payloads but
// duplicate information already shown elsewhere on the page (brand name,
// category, model, where the data came from) — real data, just not a
// "fact" worth a card of its own here.
const RAW_SPEC_META_KEYS = new Set(["מותג", "קטגוריה", "מקור רשמי", "דגם", "brand", "category", "model"]);

export function getProductKeyFacts(
  product: {
    attributeValues: { value: string; attribute: { key: string; label: string; unit: string | null; sortOrder: number } }[];
    extraSpecsRaw: string | null;
  },
  max = 5
): KeyFact[] {
  const fromAttributes: KeyFact[] = product.attributeValues
    .filter((av) => !DIMENSION_PATTERN.test(`${av.attribute.key} ${av.attribute.label}`))
    .slice()
    .sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
    .map((av) => ({
      label: av.attribute.label,
      value: formatValue(av.value, av.attribute.unit),
      icon: pickIcon(av.attribute.label, av.attribute.key),
    }));

  if (fromAttributes.length >= max) return fromAttributes.slice(0, max);

  let raw: Record<string, string> = {};
  if (product.extraSpecsRaw) {
    try {
      raw = JSON.parse(product.extraSpecsRaw);
    } catch {
      raw = {};
    }
  }
  const fromRaw: KeyFact[] = Object.entries(raw)
    .filter(([k]) => !RAW_SPEC_META_KEYS.has(k) && !DIMENSION_PATTERN.test(k))
    .map(([label, value]) => ({ label, value, icon: pickIcon(label) }));

  return [...fromAttributes, ...fromRaw].slice(0, max);
}

export type ProductDimension = { label: string; value: string };

// Dimension-family attributes come from real scraped data in two shapes —
// confirmed on real rows: some categories carry a single combined string
// ("33×21×32 ס\"מ (רוחב×עומק×גובה)", and one supplier even orders it
// "אורך×רוחב×גובה" instead), others carry separate height_cm/width_cm/
// depth_cm/weight_kg values. The combined string's part order isn't
// consistent enough to safely split into three boxes without risking a
// mislabeled dimension, so it's kept as one row exactly as scraped rather
// than parsed apart.
export function getProductDimensions(product: {
  attributeValues: { value: string; attribute: { key: string; label: string; unit: string | null; sortOrder: number } }[];
}): ProductDimension[] {
  return product.attributeValues
    .filter((av) => DIMENSION_PATTERN.test(`${av.attribute.key} ${av.attribute.label}`))
    .slice()
    .sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
    .map((av) => ({
      label: av.attribute.label,
      value: formatValue(av.value, av.attribute.unit),
    }));
}
