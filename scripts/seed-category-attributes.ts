import "dotenv/config";
import { db } from "../src/lib/db";

type AttrDef = {
  key: string;
  label: string;
  unit?: string;
  inputType?: string;
  options?: string[];
  sortOrder: number;
};

// The EU energy label rescaled to A–G in 2021 (dropping the old A+++/A++/A+
// tiers) — real products on both scales exist in the catalog (confirmed:
// several are graded D/E on the new scale), so every energy_rating select
// offers the full span rather than assuming everything is still A+++/A++/A+.
const ENERGY_RATING_FULL = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

const DEFS: Record<string, AttrDef[]> = {
  refrigeration: [
    { key: "capacity_liters", label: "נפח כולל", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "doors", label: "מספר דלתות", inputType: "number", sortOrder: 2 },
    { key: "no_frost", label: "נטול קרח", inputType: "boolean", sortOrder: 3 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 4 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 5 },
  ],
  freezers: [
    { key: "capacity_liters", label: "נפח כולל", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "no_frost", label: "נטול קרח", inputType: "boolean", sortOrder: 2 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 3 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 4 },
  ],
  "washing-machines": [
    { key: "capacity_kg", label: "קיבולת כביסה", unit: "ק\"ג", inputType: "number", sortOrder: 1 },
    { key: "spin_rpm", label: "סל\"ד סחיטה", unit: "סל\"ד", inputType: "number", sortOrder: 2 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 3 },
    { key: "noise_level", label: "רמת רעש", unit: "dB", inputType: "number", sortOrder: 4 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 5 },
  ],
  dryers: [
    { key: "capacity_kg", label: "קיבולת ייבוש", unit: "ק\"ג", inputType: "number", sortOrder: 1 },
    { key: "dryer_type", label: "סוג ייבוש", inputType: "select", options: ["קונדנסר", "משאבת חום", "פליטה"], sortOrder: 2 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 3 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 4 },
  ],
  "dishwasher-standard": [
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 1 },
    { key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "number", sortOrder: 2 },
  ],
  "built-in-oven": [
    { key: "capacity_liters", label: "נפח תא אפייה", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "cleaning_type", label: "סוג ניקוי", inputType: "select", options: ["פירוליטי", "קטליטי", "ידני"], sortOrder: 2 },
    { key: "functions_count", label: "מספר תוכניות אפייה", inputType: "number", sortOrder: 3 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 4 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 5 },
  ],
  "combi-oven": [
    { key: "capacity_liters", label: "נפח תא אפייה", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "functions_count", label: "מספר תוכניות אפייה", inputType: "number", sortOrder: 2 },
    { key: "microwave_combo", label: "כולל מיקרוגל", inputType: "boolean", sortOrder: 3 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 4 },
  ],
  "gas-cooktops": [
    { key: "burners", label: "מספר להבות", inputType: "number", sortOrder: 1 },
    { key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "number", sortOrder: 2 },
    { key: "ignition", label: "הצתה אוטומטית", inputType: "boolean", sortOrder: 3 },
    { key: "safety_valve", label: "שסתום בטיחות (כבאי גז)", inputType: "boolean", sortOrder: 4 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 5 },
  ],
  "range-hoods": [
    { key: "width_cm", label: "רוחב", unit: "ס\"מ", inputType: "number", sortOrder: 1 },
    { key: "airflow_cbm_h", label: "ספיקת אוויר", unit: "מ\"ק/שעה", inputType: "number", sortOrder: 2 },
    { key: "noise_level", label: "רמת רעש", unit: "dB", inputType: "number", sortOrder: 3 },
    { key: "hood_type", label: "סוג קולט", inputType: "select", options: ["קלאסי", "משולב", "אי", "נסתר"], sortOrder: 4 },
  ],
  microwaves: [
    { key: "capacity_liters", label: "נפח פנימי", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "grill", label: "כולל גריל", inputType: "boolean", sortOrder: 3 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 4 },
  ],
  "toaster-ovens": [
    { key: "capacity_liters", label: "נפח פנימי", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "functions_count", label: "מספר תוכניות", inputType: "number", sortOrder: 3 },
  ],
  kettles: [
    { key: "capacity_liters", label: "קיבולת", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "material", label: "חומר", inputType: "select", options: ["נירוסטה", "זכוכית", "פלסטיק"], sortOrder: 3 },
    { key: "auto_shutoff", label: "כיבוי אוטומטי", inputType: "boolean", sortOrder: 4 },
  ],
  "food-processors": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "bowl_capacity_liters", label: "נפח קערה", unit: "ליטר", inputType: "number", sortOrder: 2 },
    { key: "speeds", label: "מספר מהירויות", inputType: "number", sortOrder: 3 },
    { key: "accessories_count", label: "מספר אביזרים", inputType: "number", sortOrder: 4 },
  ],
  "coffee-machines": [
    { key: "pressure_bar", label: "לחץ", unit: "בר", inputType: "number", sortOrder: 1 },
    { key: "water_tank_liters", label: "מיכל מים", unit: "ליטר", inputType: "number", sortOrder: 2 },
    { key: "bean_to_cup", label: "טוחנת פולים", inputType: "boolean", sortOrder: 3 },
    { key: "milk_frother", label: "מקציף חלב", inputType: "boolean", sortOrder: 4 },
  ],
  "vacuum-cleaners": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "cordless", label: "אלחוטי", inputType: "boolean", sortOrder: 2 },
    { key: "battery_minutes", label: "זמן פעולה בסוללה", unit: "דקות", inputType: "number", sortOrder: 3 },
    { key: "capacity_liters", label: "נפח מכל", unit: "ליטר", inputType: "number", sortOrder: 4 },
  ],
  irons: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "steam_output", label: "פליטת קיטור", unit: "גרם/דקה", inputType: "number", sortOrder: 2 },
    { key: "soleplate", label: "סוג בסיס", inputType: "select", options: ["קרמי", "נירוסטה", "טפלון"], sortOrder: 3 },
  ],
  "split-ac": [
    { key: "capacity_btu", label: "כוח קירור", unit: "BTU", inputType: "number", sortOrder: 1 },
    // heating_btu/room_size_sqm are genuinely new concepts (heat-pump
    // heating capacity, sizing guidance) — not a rename of capacity_btu,
    // so adding them doesn't recreate the capacity/capacity_kg-style
    // duplicate-key mess fixed earlier this catalog.
    { key: "heating_btu", label: "כוח חימום", unit: "BTU", inputType: "number", sortOrder: 2 },
    { key: "room_size_sqm", label: "מתאים לחדר בגודל", unit: 'מ"ר', inputType: "number", sortOrder: 3 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+", "A", "B", "C"], sortOrder: 4 },
    { key: "inverter", label: "אינוורטר", inputType: "boolean", sortOrder: 5 },
    { key: "wifi", label: "שליטה מהאפליקציה", inputType: "boolean", sortOrder: 6 },
  ],
  heaters: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "heater_type", label: "סוג", inputType: "select", options: ["קרמי", "שמן", "הלוגן", "קונבקטור"], sortOrder: 2 },
    { key: "thermostat", label: "תרמוסטט", inputType: "boolean", sortOrder: 3 },
  ],
  fans: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "fan_type", label: "סוג", inputType: "select", options: ["עמידה", "תקרה", "שולחני", "מגדל"], sortOrder: 2 },
    { key: "remote_control", label: "שלט רחוק", inputType: "boolean", sortOrder: 3 },
  ],
  "water-taps": [
    { key: "filter_stages", label: "מספר שלבי סינון", inputType: "number", sortOrder: 1 },
    { key: "hot_water", label: "מים חמים", inputType: "boolean", sortOrder: 2 },
    { key: "sparkling_water", label: "מים מוגזים", inputType: "boolean", sortOrder: 3 },
  ],
  // The 5 categories below had zero CategoryAttribute rows at all — every
  // product in them was stuck unable to fill technicalSpec via the
  // enrichment API (only images/description were fillable). speakers is
  // the highest-priority one by far (72 incomplete products).
  speakers: [
    { key: "channels", label: "מס' ערוצים", inputType: "text", sortOrder: 1 }, // e.g. "2.1", "5.1"
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "wireless_subwoofer", label: "סאב-ווופר אלחוטי", inputType: "boolean", sortOrder: 3 },
    { key: "hdmi_arc", label: "כניסת HDMI ARC", inputType: "boolean", sortOrder: 4 },
    { key: "optical_input", label: "כניסה אופטית", inputType: "boolean", sortOrder: 5 },
    { key: "bluetooth", label: "בלוטוס", inputType: "boolean", sortOrder: 6 },
    { key: "audio_formats", label: "פורמטי שמע נתמכים", inputType: "text", sortOrder: 7 }, // e.g. "Dolby Atmos, DTS Virtual:X"
  ],
  headphones: [
    { key: "headphone_type", label: "סוג", inputType: "select", options: ["מעל האוזן", "צמוד לאוזן", "תוך-אוזני"], sortOrder: 1 },
    { key: "wireless", label: "אלחוטי", inputType: "boolean", sortOrder: 2 },
    { key: "noise_cancelling", label: "ביטול רעשים אקטיבי", inputType: "boolean", sortOrder: 3 },
    { key: "battery_hours", label: "זמן פעולה בסוללה", unit: "שעות", inputType: "number", sortOrder: 4 },
    { key: "bluetooth_version", label: "גרסת בלוטוס", inputType: "text", sortOrder: 5 },
  ],
  "receivers-amplifiers": [
    { key: "channels", label: "מס' ערוצים", inputType: "text", sortOrder: 1 }, // e.g. "5.1", "7.2"
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "hdmi_inputs", label: "כניסות HDMI", inputType: "number", sortOrder: 3 },
    { key: "dolby_atmos", label: "Dolby Atmos", inputType: "boolean", sortOrder: 4 },
    { key: "wifi", label: "Wi-Fi מובנה", inputType: "boolean", sortOrder: 5 },
  ],
  "personal-care": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "usage_type", label: "אופן שימוש", inputType: "select", options: ["רטוב ויבש", "יבש בלבד"], sortOrder: 2 },
    { key: "cordless", label: "אלחוטי", inputType: "boolean", sortOrder: 3 },
  ],
  projectors: [
    { key: "brightness_lumens", label: "בהירות", unit: "לומן", inputType: "number", sortOrder: 1 },
    { key: "resolution", label: "רזולוציה", inputType: "select", options: ["HD", "Full HD", "4K"], sortOrder: 2 },
    { key: "throw_type", label: "סוג הקרנה", inputType: "select", options: ["טווח קצר", "רגיל"], sortOrder: 3 },
    { key: "built_in_speaker", label: "רמקול מובנה", inputType: "boolean", sortOrder: 4 },
  ],

  // The 52 categories below had zero CategoryAttribute rows at all — every
  // product in them was stuck unable to fill technicalSpec via the
  // enrichment API at all (only images/description were fillable).
  "bread-makers": [
    { key: "capacity_grams", label: "קיבולת", unit: "גרם", inputType: "number", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 3 },
  ],
  blenders: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "jar_capacity_liters", label: "נפח כד", unit: "ליטר", inputType: "number", sortOrder: 2 },
    { key: "speeds", label: "מספר מהירויות", inputType: "number", sortOrder: 3 },
    { key: "jar_material", label: "חומר הכד", inputType: "select", options: ["פלסטיק", "זכוכית", "נירוסטה"], sortOrder: 4 },
  ],
  "water-dispensers": [
    { key: "hot_water", label: "מים חמים", inputType: "boolean", sortOrder: 1 },
    { key: "cold_water", label: "מים קרים", inputType: "boolean", sortOrder: 2 },
    { key: "filter_stages", label: "מספר שלבי סינון", inputType: "number", sortOrder: 3 },
  ],
  cables: [
    { key: "length_meters", label: "אורך", unit: "מטר", inputType: "number", sortOrder: 1 },
    { key: "cable_type", label: "סוג חיבור", inputType: "select", options: ["HDMI", "USB-C", "USB-A", "Lightning", "אחר"], sortOrder: 2 },
  ],
  "heating-ventilation": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "coverage_sqm", label: "שטח כיסוי", unit: 'מ"ר', inputType: "number", sortOrder: 2 },
    { key: "thermostat", label: "תרמוסטט", inputType: "boolean", sortOrder: 3 },
  ],
  tabuns: [
    { key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "fuel_type", label: "סוג הסקה", inputType: "select", options: ["גז", "פחם", "עצים"], sortOrder: 2 },
  ],
  tablets: [
    { key: "screen_size", label: "גודל מסך", unit: '"', inputType: "text", sortOrder: 1 },
    { key: "storage_gb", label: "נפח אחסון", unit: "GB", inputType: "number", sortOrder: 2 },
    { key: "ram_gb", label: "זיכרון RAM", unit: "GB", inputType: "number", sortOrder: 3 },
    { key: "cellular", label: "תמיכה בסים", inputType: "boolean", sortOrder: 4 },
  ],
  "sandwich-toasters": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "plates_count", label: "מספר צלחות", inputType: "number", sortOrder: 2 },
    { key: "non_stick", label: "ציפוי נון-סטיק", inputType: "boolean", sortOrder: 3 },
  ],
  "pop-up-toasters": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "slots", label: "מספר חריצים", inputType: "number", sortOrder: 2 },
    { key: "defrost_function", label: "פונקציית הפשרה", inputType: "boolean", sortOrder: 3 },
  ],
  "tv-multimedia": [
    { key: "hdmi_ports", label: "כניסות HDMI", inputType: "number", sortOrder: 1 },
    { key: "resolution_support", label: "רזולוציה נתמכת", inputType: "select", options: ["HD", "Full HD", "4K"], sortOrder: 2 },
  ],
  "cordless-phones": [
    { key: "handsets_count", label: "מספר שפופרות", inputType: "number", sortOrder: 1 },
    { key: "range_meters", label: "טווח קליטה", unit: "מטר", inputType: "number", sortOrder: 2 },
    { key: "answering_machine", label: "משיבון", inputType: "boolean", sortOrder: 3 },
  ],
  "landline-phones": [
    { key: "caller_id", label: "מזהה שיחה", inputType: "boolean", sortOrder: 1 },
    { key: "speakerphone", label: "דיבורית", inputType: "boolean", sortOrder: 2 },
  ],
  laundry: [
    { key: "capacity_kg", label: "קיבולת", unit: 'ק"ג', inputType: "number", sortOrder: 1 },
    { key: "material", label: "חומר", inputType: "text", sortOrder: 2 },
  ],
  "hot-plates": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "burners", label: "מספר כירות", inputType: "number", sortOrder: 2 },
    { key: "portable", label: "נייד", inputType: "boolean", sortOrder: 3 },
  ],
  "induction-cooktops": [
    { key: "burners", label: "מספר כירות", inputType: "number", sortOrder: 1 },
    { key: "width_cm", label: "רוחב", unit: 'ס"מ', inputType: "number", sortOrder: 2 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 3 },
    { key: "child_lock", label: "נעילת ילדים", inputType: "boolean", sortOrder: 4 },
  ],
  "ceramic-cooktops": [
    { key: "burners", label: "מספר כירות", inputType: "number", sortOrder: 1 },
    { key: "width_cm", label: "רוחב", unit: 'ס"מ', inputType: "number", sortOrder: 2 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 3 },
  ],
  "ceiling-fans": [
    { key: "blade_span_cm", label: "קוטר להבים", unit: 'ס"מ', inputType: "number", sortOrder: 1 },
    { key: "remote_control", label: "שלט רחוק", inputType: "boolean", sortOrder: 2 },
    { key: "light_kit", label: "כולל תאורה", inputType: "boolean", sortOrder: 3 },
    { key: "speeds", label: "מספר מהירויות", inputType: "number", sortOrder: 4 },
  ],
  dishwashers: [
    { key: "place_settings", label: "מערכות כלים", inputType: "number", sortOrder: 1 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 2 },
    { key: "noise_level", label: "רמת רעש", unit: "dB", inputType: "number", sortOrder: 3 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ENERGY_RATING_FULL, sortOrder: 4 },
  ],
  "home-appliances": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "material", label: "חומר", inputType: "text", sortOrder: 2 },
  ],
  "small-kitchen-appliances": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", sortOrder: 2 },
  ],
  "hair-straighteners": [
    { key: "plate_material", label: "חומר הפלטות", inputType: "select", options: ["קרמי", "טורמלין", "טיטניום"], sortOrder: 1 },
    { key: "temperature_max", label: "טמפרטורה מקסימלית", unit: "°C", inputType: "number", sortOrder: 2 },
    { key: "auto_shutoff", label: "כיבוי אוטומטי", inputType: "boolean", sortOrder: 3 },
  ],
  "computers-communication": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "connectivity", label: "חיבוריות", inputType: "text", sortOrder: 2 },
  ],
  "coffee-grinders": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "capacity_grams", label: "קיבולת", unit: "גרם", inputType: "number", sortOrder: 2 },
    { key: "grind_settings", label: "מספר דרגות טחינה", inputType: "number", sortOrder: 3 },
  ],
  "meat-grinders": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "capacity_kg_hour", label: "קיבולת טחינה", unit: 'ק"ג/שעה', inputType: "number", sortOrder: 2 },
    { key: "stainless_blades", label: "סכינים מנירוסטה", inputType: "boolean", sortOrder: 3 },
  ],
  "air-conditioning": [
    { key: "capacity_btu", label: "כוח קירור", unit: "BTU", inputType: "number", sortOrder: 1 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ENERGY_RATING_FULL, sortOrder: 2 },
    { key: "inverter", label: "אינוורטר", inputType: "boolean", sortOrder: 3 },
    { key: "wifi", label: "שליטה מהאפליקציה", inputType: "boolean", sortOrder: 4 },
  ],
  "hair-dryers": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "ionic", label: "טכנולוגיית יונים", inputType: "boolean", sortOrder: 2 },
    { key: "attachments_count", label: "מספר ראשים", inputType: "number", sortOrder: 3 },
  ],
  mixers: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "bowl_capacity_liters", label: "נפח קערה", unit: "ליטר", inputType: "number", sortOrder: 2 },
    { key: "speeds", label: "מספר מהירויות", inputType: "number", sortOrder: 3 },
    { key: "attachments_count", label: "מספר אביזרים", inputType: "number", sortOrder: 4 },
  ],
  shavers: [
    { key: "wireless", label: "אלחוטי", inputType: "boolean", sortOrder: 1 },
    { key: "wet_dry", label: "רטוב ויבש", inputType: "boolean", sortOrder: 2 },
    { key: "battery_minutes", label: "זמן פעולה בסוללה", unit: "דקות", inputType: "number", sortOrder: 3 },
  ],
  "hair-clippers": [
    { key: "wireless", label: "אלחוטי", inputType: "boolean", sortOrder: 1 },
    { key: "battery_minutes", label: "זמן פעולה בסוללה", unit: "דקות", inputType: "number", sortOrder: 2 },
    { key: "attachments_count", label: "מספר ראשים", inputType: "number", sortOrder: 3 },
  ],
  grills: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "grill_type", label: "סוג", inputType: "select", options: ["חשמלי", "גז", "פחם"], sortOrder: 2 },
  ],
  juicers: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "juicer_type", label: "סוג", inputType: "select", options: ["סחיטה איטית", "צנטריפוגה"], sortOrder: 2 },
    { key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", sortOrder: 3 },
  ],
  epilators: [
    { key: "wireless", label: "אלחוטי", inputType: "boolean", sortOrder: 1 },
    { key: "tweezers_count", label: "מספר פינצטות", inputType: "number", sortOrder: 2 },
    { key: "wet_dry", label: "רטוב ויבש", inputType: "boolean", sortOrder: 3 },
  ],
  "projector-screens": [
    { key: "screen_size", label: "גודל מסך", unit: '"', inputType: "text", sortOrder: 1 },
    { key: "screen_type", label: "סוג", inputType: "select", options: ["קבוע", "נשלף", "חשמלי"], sortOrder: 2 },
  ],
  "hair-curlers": [
    { key: "barrel_diameter_mm", label: "קוטר הברזל", unit: 'מ"מ', inputType: "number", sortOrder: 1 },
    { key: "temperature_max", label: "טמפרטורה מקסימלית", unit: "°C", inputType: "number", sortOrder: 2 },
    { key: "auto_shutoff", label: "כיבוי אוטומטי", inputType: "boolean", sortOrder: 3 },
  ],
  "security-cameras": [
    { key: "resolution", label: "רזולוציה", inputType: "select", options: ["HD", "Full HD", "4K"], sortOrder: 1 },
    { key: "night_vision", label: "ראיית לילה", inputType: "boolean", sortOrder: 2 },
    { key: "wifi", label: "Wi-Fi", inputType: "boolean", sortOrder: 3 },
    { key: "storage_type", label: "סוג אחסון", inputType: "select", options: ["כרטיס זיכרון", "ענן"], sortOrder: 4 },
  ],
  "heat-fans": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "thermostat", label: "תרמוסטט", inputType: "boolean", sortOrder: 2 },
    { key: "tip_over_protection", label: "הגנת נפילה", inputType: "boolean", sortOrder: 3 },
  ],
  "milk-frothers": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "capacity_ml", label: "נפח", unit: 'מ"ל', inputType: "number", sortOrder: 2 },
    { key: "hot_cold", label: "קצפת חמה וקרה", inputType: "boolean", sortOrder: 3 },
  ],
  soundbars: [
    { key: "channels", label: "מס' ערוצים", inputType: "text", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "wireless_subwoofer", label: "סאב-ווופר אלחוטי", inputType: "boolean", sortOrder: 3 },
    { key: "hdmi_arc", label: "כניסת HDMI ARC", inputType: "boolean", sortOrder: 4 },
    { key: "bluetooth", label: "בלוטוס", inputType: "boolean", sortOrder: 5 },
  ],
  "wine-fridge": [
    { key: "capacity_bottles", label: "קיבולת בקבוקים", inputType: "number", sortOrder: 1 },
    { key: "zones_count", label: "מספר אזורי טמפרטורה", inputType: "number", sortOrder: 2 },
  ],
  "mini-fridge": [
    { key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ENERGY_RATING_FULL, sortOrder: 2 },
    { key: "noise_level", label: "רמת רעש", unit: "dB", inputType: "number", sortOrder: 3 },
  ],
  "bluray-streamers": [
    { key: "resolution_support", label: "רזולוציה נתמכת", inputType: "select", options: ["Full HD", "4K"], sortOrder: 1 },
    { key: "wifi", label: "Wi-Fi", inputType: "boolean", sortOrder: 2 },
  ],
  subwoofers: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "wireless", label: "אלחוטי", inputType: "boolean", sortOrder: 2 },
    { key: "driver_size_inch", label: "קוטר הרמקול", unit: '"', inputType: "number", sortOrder: 3 },
  ],
  "heating-blankets": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "auto_shutoff", label: "כיבוי אוטומטי", inputType: "boolean", sortOrder: 2 },
    { key: "washable", label: "ניתן לכביסה", inputType: "boolean", sortOrder: 3 },
  ],
  "audio-home-theater": [
    { key: "channels", label: "מס' ערוצים", inputType: "text", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "bluetooth", label: "בלוטוס", inputType: "boolean", sortOrder: 3 },
  ],
  "air-fryers": [
    { key: "capacity_liters", label: "נפח", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 2 },
    { key: "digital_display", label: "צג דיגיטלי", inputType: "boolean", sortOrder: 3 },
    { key: "programs", label: "מספר תוכניות", inputType: "number", sortOrder: 4 },
  ],
  "gaming-consoles": [
    { key: "storage_gb", label: "נפח אחסון", unit: "GB", inputType: "number", sortOrder: 1 },
    { key: "included_controllers", label: "מספר בקרים כלולים", inputType: "number", sortOrder: 2 },
  ],
  "mosquito-killers": [
    { key: "coverage_sqm", label: "שטח כיסוי", unit: 'מ"ר', inputType: "number", sortOrder: 1 },
    { key: "power_source", label: "מקור הזנה", inputType: "select", options: ["חשמל", "סוללה"], sortOrder: 2 },
    { key: "uv_lamp", label: "מנורת UV", inputType: "boolean", sortOrder: 3 },
  ],
  radiators: [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "fins_count", label: "מספר צלעות", inputType: "number", sortOrder: 2 },
    { key: "thermostat", label: "תרמוסטט", inputType: "boolean", sortOrder: 3 },
    { key: "wheels", label: "גלגלים", inputType: "boolean", sortOrder: 4 },
  ],
  "portable-speakers": [
    { key: "power_watts", label: "הספק", unit: "וואט", inputType: "number", sortOrder: 1 },
    { key: "battery_hours", label: "זמן פעולה בסוללה", unit: "שעות", inputType: "number", sortOrder: 2 },
    { key: "waterproof", label: "עמיד במים", inputType: "boolean", sortOrder: 3 },
    { key: "bluetooth", label: "בלוטוס", inputType: "boolean", sortOrder: 4 },
  ],
  "tv-stands": [
    { key: "max_screen_size", label: "גודל מסך מקסימלי", unit: '"', inputType: "text", sortOrder: 1 },
    { key: "width_cm", label: "רוחב", unit: 'ס"מ', inputType: "number", sortOrder: 2 },
    { key: "material", label: "חומר", inputType: "text", sortOrder: 3 },
  ],
  "smart-lighting": [
    { key: "wifi", label: "Wi-Fi", inputType: "boolean", sortOrder: 1 },
    { key: "color_changing", label: "צבע מתחלף", inputType: "boolean", sortOrder: 2 },
    { key: "app_control", label: "שליטה מהאפליקציה", inputType: "boolean", sortOrder: 3 },
  ],
  "ovens-cooktops": [
    { key: "capacity_liters", label: "נפח תא אפייה", unit: "ליטר", inputType: "number", sortOrder: 1 },
    { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ENERGY_RATING_FULL, sortOrder: 2 },
    { key: "color", label: "צבע", inputType: "text", sortOrder: 3 },
  ],
};

async function main() {
  let created = 0;
  for (const [slug, attrs] of Object.entries(DEFS)) {
    const category = await db.category.findUnique({ where: { slug } });
    if (!category) {
      console.log("SKIP (no category)", slug);
      continue;
    }
    for (const a of attrs) {
      const result = await db.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: category.id, key: a.key } },
        update: {},
        create: {
          categoryId: category.id,
          key: a.key,
          label: a.label,
          unit: a.unit,
          inputType: a.inputType ?? "text",
          options: a.options ? JSON.stringify(a.options) : null,
          sortOrder: a.sortOrder,
        },
      });
      created++;
      void result;
    }
    console.log("done", slug, attrs.length, "attrs");
  }
  console.log("total upserted:", created);

  // Widen every existing energy_rating select (regardless of category) to
  // the full A+++–G span — real products graded D/E on the post-2021 scale
  // couldn't be given a rating at all under the old A+++/A++/A+-only lists.
  const widened = await db.categoryAttribute.updateMany({
    where: { key: "energy_rating" },
    data: { options: JSON.stringify(ENERGY_RATING_FULL) },
  });
  console.log("energy_rating options widened on", widened.count, "categories");

  process.exit(0);
}

main();
