/**
 * Which products each store in the 3D mall shows, by slug.
 *
 * The list is the owner's pick from 18 November: products live on the site,
 * priced at or below the market (PriceBenchmark), ranked by visitors over 30
 * days — or, where nothing compares, the most viewed. Two that were in the
 * mall and cost more than the market were dropped on purpose (Tefal GV9567,
 * Remington S5527).
 *
 * Only slugs live here. Name, image, price and whether it can be ordered are
 * read from the product itself on every request (/api/game/stores), so the
 * mall can never show a price the site no longer charges — the frozen
 * snapshot inside the game is what this replaces. A slug whose product
 * stops being sellable simply drops out of its store.
 *
 * The keys are the game's store names.
 */
export const MALL_STORES: Record<string, { label: string; slugs: string[] }> = {
  "tv-multimedia": {
    label: "טלוויזיות",
    slugs: [
      "tvs-7340ca22",
      "tvs-b3ad32a3",
      "tvs-2e7acb5f",
      "sony-tvs-k-43s35bp",
      "mre85r85h-a9e76f7f",
      "tvs-9304739c",
      "samsung-tvs-qe55q60dauxil",
    ],
  },
  refrigeration: {
    label: "קירור",
    slugs: [
      "haier-fridge-bottom-freezer-hdr5818dn",
      "general-fridge-4-door-ff4-65bix",
      "siemens-refrigeration-kg49nsbbf",
      "hisense-fridge-bottom-freezer-rb3k330sefe",
      "bespoke-de6e34-refrigeration-rb53dg703cs9",
      "haier-refrigeration-hdr5818w",
      "833-a314b5-refrigeration-hcr59f18dnmb",
    ],
  },
  laundry: {
    label: "כביסה ומדיחים",
    slugs: [
      "aeg-dishwasher-standard-fsk93707p",
      "hyundai-washing-machines-haw-w1025bx",
      "siemens-dishwasher-standard-sn63ex21ae",
      "blomberg-dishwasher-standard-gvn409p8",
      "bosch-dishwasher-standard-smv6ecx23e",
      "beko-dryers-bm3t482w",
    ],
  },
  "ovens-cooktops": {
    label: "תנורים וכיריים",
    slugs: [
      "stanley-built-in-oven-73tpt500g",
      "delonghi-gas-cooktops-dgh3190cx",
      "miele-gas-cooktops-km-2357-61bf9647",
      "sauter-gas-cooktops-sch4421",
      "elica-range-hoods-joy-blixa90",
      "aeg-hybrid-cooktops-hdb95623nb-ecbba657",
      "bosch-induction-cooktops-pvw81chb1e",
    ],
  },
  "small-kitchen-appliances": {
    label: "מטבח קטן",
    slugs: [
      "smeg-food-processors-smf03pgeu",
      "caso-mixers-km-1800-black-e",
      "ninja-food-processors-sl403",
      "gorenje-food-processors-hb600orab",
      "tefal-toaster-ovens-gc5108e0",
      "caso-small-kitchen-appliances-proslim-2000",
      "gorenje-microwaves-bm251sg2bg",
    ],
  },
  "audio-home-theater": {
    label: "אודיו",
    slugs: [
      "klipsch-speakers-aw-650",
      "monitor-audio-speakers-bronze-500-6g",
      "onkyo-receivers-amplifiers-tx-nr6100",
      "unknown-speakers-swa-9500s",
      "klipsch-speakers-flexus-core-300-03ed9f0b",
      "klipsch-speakers-flexus-sub-100",
    ],
  },
  "heating-ventilation": {
    label: "חימום",
    slugs: [
      "hyundai-heaters-hah-2022",
      "hamilton-beach-heaters-hem-955",
      "hyundai-heaters-hah-6200",
      "hyundai-heaters-hahz-1500",
      "semicom-heaters-hah-2005",
      "hyundai-heaters-hah-1915",
      "hyundai-heaters-hah-2040",
    ],
  },
  "home-appliances": {
    label: "מוצרי חשמל לבית",
    slugs: [
      "tefal-irons-fv2c41g0",
      "dreame-vacuum-cleaners-t16-ae",
      "shark-vacuum-cleaners-ip1253",
      "braun-irons-is1512bl",
    ],
  },
  "air-conditioning": {
    label: "מיזוג אוויר",
    slugs: [
      "somo-split-ac-flexis-12-eco-bk",
      "somo-split-ac-max140inverter",
      "electra-split-ac-a170-inverter",
      "saga-split-ac-saga-pro-inv-16-x-wifi-eu",
      "alpha-pro-inverter-340a-wifi-9fa727be",
    ],
  },
  "personal-care": {
    label: "טיפוח",
    slugs: ["philips-shavers-s588310", "caso-small-kitchen-appliances-bodyenergy-pro"],
  },
};
