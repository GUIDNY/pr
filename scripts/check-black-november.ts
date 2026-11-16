// The size and panel on a Black November card come out of the product's own
// title and are never guessed — see lib/campaigns/black-november.ts.
//
// Run: npx tsx scripts/check-black-november.ts
import { blackNovemberScope, televisionFacts, televisionSpecFacts, tvSizeBucket } from "../src/lib/campaigns/black-november";

let failed = 0;
let total = 0;
const is = (name: string, got: unknown, expected: unknown) => {
  total++;
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    failed++;
    console.error(`FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
};

// Titles as they are written in the catalogue.
is("NanoCell, apostrophe after אינץ", televisionFacts("טלוויזיה LG NanoCell 65NU850B6 65 אינץ' 4K - webOS 26"), { inches: 65, panel: "NanoCell" });
is("NANO in capitals", televisionFacts("טלוויזיה LG 85NU850B6LA 85 אינץ' NANO 4K UHD AI חכמה 2026"), { inches: 85, panel: "NanoCell" });
is("QNED Mini LED, geresh", televisionFacts("טלוויזיה חכמה LG QNED evo AI Mini LED בגודל 55 אינץ׳ 4K דגם 55QNED85B6T"), { inches: 55, panel: "QNED Mini LED" });
is("three digits", televisionFacts("טלוויזיה LG 100QNED85B8 בגודל 100 אינץ' QNED evo Mini LED 4K 120Hz"), { inches: 100, panel: "QNED Mini LED" });
is("no space before אינץ", televisionFacts("טלוויזיה LG 98NU850B6 98אינץ NANO 4K"), { inches: 98, panel: "NanoCell" });
is("OLED inside the model code", televisionFacts("טלוויזיה LG 55 אינץ' דגם OLED55B6ELA"), { inches: 55, panel: "OLED" });
is("QNED is not OLED", televisionFacts("טלוויזיה LG QNED 65 אינץ'"), { inches: 65, panel: "QNED" });
is("OLED as a word", televisionFacts("טלוויזיה LG OLED evo 65 אינץ'"), { inches: 65, panel: "OLED" });
// Nothing stated, nothing shown.
is("no size in the title", televisionFacts("טלוויזיה LG NanoCell 65NU850B6"), { inches: null, panel: "NanoCell" });
is("no panel in the title", televisionFacts("טלוויזיה 65 אינץ' 4K חכמה"), { inches: 65, panel: null });
is("a model code is not a size", televisionFacts("מקרר 648 ליטר"), { inches: null, panel: null });

// What sets one set apart — from the specs as the catalogue holds them, and
// nothing when a spec is missing (16 November).
is("75QNED85B6T", televisionSpecFacts({ refresh_rate_hz: "120", hdr: "Dolby Vision / HDR10 / HLG", processor: "α8 AI 4K Gen3" }), ["120Hz", "Dolby Vision", "מעבד α8"]);
is("75NU850B6LA, no refresh rate recorded", televisionSpecFacts({ processor: "α7 AI Processor 4K Gen9" }), ["מעבד α7"]);
is("55QNED8MB6T, HDR10 only", televisionSpecFacts({ refresh_rate_hz: "120", hdr: "HDR10 / HLG" }), ["120Hz"]);
is("refresh rate written with Hz", televisionSpecFacts({ refresh_rate_hz: "60Hz" }), ["60Hz"]);
is("no specs, no line", televisionSpecFacts({}), []);
is("a value that is not a rate", televisionSpecFacts({ refresh_rate_hz: "עד 144Hz" }), []);

is("55 → 55", tvSizeBucket(55), "55");
is("86 → 85+", tvSizeBucket(86), "85");
is("100 → 85+", tvSizeBucket(100), "85");
is("50 → 50", tvSizeBucket(50), "50");
is("unknown size has no bucket", tvSizeBucket(null), null);

is("subject, one brand of televisions", blackNovemberScope([{ title: "טלוויזיה LG", brandName: "LG" }]).subject, "טלוויזיות LG");
is("subject, mixed", blackNovemberScope([{ title: "טלוויזיה LG", brandName: "LG" }, { title: "מקרר", brandName: "Bosch" }]).subject, "מוצרים נבחרים");

console.log(`${total - failed}/${total} passed`);
if (failed) process.exit(1);
