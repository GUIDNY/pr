// Decorative product photography used purely for homepage visual polish — the
// hero collage and a subset of the category explorer tiles. Sourced from
// Unsplash (free to use under the Unsplash License, no attribution required:
// https://unsplash.com/license). These are generic category-representative
// photos, not photos of any specific catalog SKU — nothing here should be
// treated as (or captioned as) a real product photo tied to catalog data.

function unsplash(id: string, width = 1200) {
  return `https://images.unsplash.com/${id}?fm=jpg&q=80&w=${width}&auto=format&fit=crop`;
}

export const HERO_CAROUSEL_IMAGES = [
  unsplash("photo-1588854337115-1c67d9247e4d", 1400), // stainless fridge
  unsplash("photo-1593359677879-a4bb92f829d1", 1400), // tv
  unsplash("photo-1626806787461-102c1bfaaea1", 1400), // washing machine
  unsplash("photo-1637029436347-e33bf98a5412", 1400), // espresso machine
  unsplash("photo-1546435770-a3e426bf472b", 1400), // headphones
];

export const CATEGORY_TILE_IMAGES: Record<string, string> = {
  "tv-multimedia": unsplash("photo-1552831388-6a0b3575b32a"),
  "audio-home-theater": unsplash("photo-1609081219090-a6d81d3085bf"),
  refrigeration: unsplash("photo-1544928879-7342a2f3ce42"),
  laundry: unsplash("photo-1597418048367-7dd01e4404ee"),
  dishwashers: unsplash("photo-1641823911769-c55f23c25143"),
  "ovens-cooktops": unsplash("photo-1677727852911-74e9d5269003"),
  "small-kitchen-appliances": unsplash("photo-1560885521-4e61e9bc1631"),
  "home-appliances": unsplash("photo-1631016042350-a3a5a5cdf2e0"),
  "air-conditioning": unsplash("photo-1550998251-1e18917c975c"),
};
