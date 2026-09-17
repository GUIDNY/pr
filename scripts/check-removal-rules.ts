// Guards the old-appliance removal against the ways it can quietly become a
// promise the shop cannot keep.
//
// Nothing here talks to a database, and nothing here checks whether the
// policy is *right*. It checks that the rules agree with each other — which
// is where this feature fails, because the same facts are stated in five
// places: the checkout the customer ticks, the confirmation they read, the
// email they keep, the text handed to the carrier, and the standing page the
// terms point at.
//
// Run: npm run check:removal
import {
  REMOVAL_ACKNOWLEDGEMENT,
  REMOVAL_ORDERING_ENABLED,
  REMOVAL_PAGE_PATH,
  REMOVAL_PREPARATION,
  asksExceptionalQuestions,
  initialRemovalStatus,
  parseRemovalReasons,
  removalCostLine,
  removalHandoffText,
  removalRequestLabel,
  removalTimingNote,
  removalTypeForCarrier,
  resolveRemovalGroup,
  type RemovalGroup,
  type RecyclingRow,
} from "../src/lib/recycling";
import {
  EXCEPTIONAL_REMOVAL_REASONS,
  REMOVAL_STATUSES,
  REMOVAL_STATUS_COLORS,
  REMOVAL_STATUS_LABELS,
  type RemovalStatus,
} from "../src/lib/enums";
import { RECYCLING_GROUPS, CATEGORY_RECYCLING_MAP } from "./recycling-seed-data";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return;
  console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

// ---------------------------------------------------------------- enums

for (const status of REMOVAL_STATUSES) {
  check(`status ${status} has a Hebrew label`, Boolean(REMOVAL_STATUS_LABELS[status]));
  check(`status ${status} has a colour`, Boolean(REMOVAL_STATUS_COLORS[status]));
}

const reasonKeys = EXCEPTIONAL_REMOVAL_REASONS.map((r) => r.key);
check("access-question keys are unique", new Set(reasonKeys).size === reasonKeys.length);
check(
  "every access question has wording",
  EXCEPTIONAL_REMOVAL_REASONS.every((r) => r.label.trim().length > 0),
);
/* "לא בטוח" is on the list for a reason and its absence would be a silent
   behaviour change: without it, somebody who cannot tell whether their lift
   reaches their floor ticks nothing, which reads as a clean free removal —
   the one outcome nobody can recover on the doorstep. */
check("an 'unsure' answer is offered", reasonKeys.includes("UNSURE"));

// ------------------------------------------------------------ the seed

const seedKeys = RECYCLING_GROUPS.map((g) => g.key);
check("group keys are unique", new Set(seedKeys).size === seedKeys.length);
for (const g of RECYCLING_GROUPS) {
  /* The same pattern saveRecyclingGroupAction enforces. The key is
     snapshotted onto order lines and is what the carrier is told, so it has
     to survive a CSV and a booking form. */
  check(`key ${g.key} is a safe machine name`, /^[a-z][a-z0-9_]{1,40}$/.test(g.key));
  check(`${g.key} names the product`, g.label.trim().length > 0);
  /* The whole phrase, already agreeing in gender and number — building it by
     appending "ישן" to the label produces "מכונת כביסה ישן". */
  check(`${g.key} names the old one`, g.oldLabel.trim().length > 0);
  check(
    `${g.key} does not ask the access questions unless it is a large appliance`,
    !g.asksExceptional || g.isLargeAppliance,
    "only a large appliance can produce a chargeable exceptional removal",
  );
}

const mapped = Object.values(CATEGORY_RECYCLING_MAP);
for (const key of new Set(mapped)) {
  check(`category map points at a real group (${key})`, seedKeys.includes(key));
}

// --------------------------------------------------------------- rules

const fridge: RemovalGroup = {
  key: "refrigerator",
  label: "מקרר",
  oldLabel: "מקרר ישן",
  isLargeAppliance: true,
  asksExceptional: true,
  exceptionalFee: null,
};
const kettle: RemovalGroup = { ...fridge, key: "kettle", label: "קומקום", oldLabel: "קומקום ישן", isLargeAppliance: false, asksExceptional: false };

/* Somebody collecting from the counter in Hadera is carrying the old one to
   us. Asking how many flights of stairs there are is asking about a journey
   the shop is not making. */
check("no access questions on branch collection", !asksExceptionalQuestions(fridge, "PICKUP"));
check("access questions on home delivery", asksExceptionalQuestions(fridge, "DELIVERY"));
check("no access questions for a kettle", !asksExceptionalQuestions(kettle, "DELIVERY"));

check("an ordinary home delivery is just requested", initialRemovalStatus("DELIVERY", false) === "REQUESTED");
check("an exceptional one waits for a phone call", initialRemovalStatus("DELIVERY", true) === "NEEDS_COORDINATION");
/* The courier who drops a parcel at a shop counter is not collecting a fridge
   from a flat. Promising otherwise at the checkout is the failure this whole
   feature exists to prevent. */
check(
  "a collection point always waits for a phone call",
  initialRemovalStatus("PICKUP_POINT", false) === "NEEDS_COORDINATION",
);
check("branch collection needs no call", initialRemovalStatus("PICKUP", false) === "REQUESTED");

/* Never "חינם" on a removal that is going to coordination: that is the word a
   customer would hold the shop to, and the law wants the price known before
   the work. */
check("a coordinated removal is not called free", !removalCostLine("NEEDS_COORDINATION", null).includes("חינם"));
check("an ordinary removal is called free", removalCostLine("REQUESTED", null) === "ללא עלות");
check("an agreed price is printed", removalCostLine("NEEDS_COORDINATION", 250).includes("250"));

// ------------------------------------------------------------- wording

check(
  "the checkbox names the appliance",
  removalRequestLabel(fridge, "DELIVERY").includes("מקרר ישן") &&
    !removalRequestLabel(fridge, "DELIVERY").includes("מוצר ישן"),
  removalRequestLabel(fridge, "DELIVERY"),
);
check(
  "branch collection says 'hand over', not 'we will collect'",
  removalRequestLabel(fridge, "PICKUP").includes("למסור"),
  removalRequestLabel(fridge, "PICKUP"),
);
check(
  "a collection point does not promise a doorstep collection",
  !removalTimingNote("PICKUP_POINT").includes("בעת אספקת"),
  removalTimingNote("PICKUP_POINT"),
);
check("the preparation list is not empty", REMOVAL_PREPARATION.length >= 5);
check("the acknowledgement names all three conditions",
  ["ריק", "מנותק", "נגיש"].every((w) => REMOVAL_ACKNOWLEDGEMENT.includes(w)),
  REMOVAL_ACKNOWLEDGEMENT,
);
check("the standing page address is the one the brief asked for", REMOVAL_PAGE_PATH === "/old-product-removal");

// -------------------------------------------------------- the hand-off

check("washing_machine reads as Washing Machine", removalTypeForCarrier("washing_machine") === "Washing Machine");

const handoff = removalHandoffText({
  orderNumber: "PR-123456",
  customerName: "ישראל ישראלי",
  phone: "050-0000000",
  address: "הרצל 1, חיפה",
  methodLabel: "משלוח עד הבית",
  lines: [
    {
      key: "refrigerator",
      label: "מקרר",
      productTitle: "מקרר סמסונג",
      exceptional: true,
      reasonLabels: ["נדרש מנוף"],
      notes: "המקרר במרפסת",
    },
  ],
});
/* The two keywords a dispatcher scans for, and what an integration would key
   on later. They are in English for that reason and not by accident. */
check("the hand-off announces itself", handoff.includes("OLD PRODUCT REMOVAL: YES"), handoff);
check("the hand-off names the type in English", handoff.includes("TYPE: Refrigerator"));
check("the hand-off flags an exceptional removal", handoff.includes("EXCEPTIONAL: YES"));
check("the hand-off carries the address", handoff.includes("הרצל 1, חיפה"));
check("the hand-off carries the customer's note", handoff.includes("המקרר במרפסת"));

// --------------------------------------------------------- resolution

const enabled: RecyclingRow = { ...fridge, isEnabled: true };
const disabled: RecyclingRow = { ...fridge, isEnabled: false };

check(
  "a product override beats its category",
  resolveRemovalGroup({
    recyclingOptOut: false,
    recyclingCategory: { ...enabled, key: "microwave" },
    category: { recyclingCategory: enabled },
  })?.key === "microwave",
);
check(
  "the category answers when the product does not",
  resolveRemovalGroup({ recyclingOptOut: false, recyclingCategory: null, category: { recyclingCategory: enabled } })
    ?.key === "refrigerator",
);
check(
  "an opted-out product offers nothing",
  resolveRemovalGroup({ recyclingOptOut: true, recyclingCategory: null, category: { recyclingCategory: enabled } }) ===
    null,
);
check(
  "a switched-off group offers nothing",
  resolveRemovalGroup({ recyclingOptOut: false, recyclingCategory: null, category: { recyclingCategory: disabled } }) ===
    null,
);
check(
  "an unmapped product offers nothing",
  resolveRemovalGroup({ recyclingOptOut: false, recyclingCategory: null, category: { recyclingCategory: null } }) ===
    null,
);

// A column of JSON in a String column, written by hand or by an older build,
// must not be able to take an order screen down.
check("garbage reasons parse to nothing", parseRemovalReasons("not json") .length === 0);
check("a non-array parses to nothing", parseRemovalReasons('{"a":1}').length === 0);
check("non-strings are dropped", parseRemovalReasons('["CRANE",7,null]').length === 1);
check("null parses to nothing", parseRemovalReasons(null).length === 0);

// ----------------------------------------------------------------- out

const statuses: RemovalStatus[] = [...REMOVAL_STATUSES];
if (failed > 0) {
  console.log(`\n${failed} בעיות`);
  process.exit(1);
}
console.log(
  `OK  removal rules agree  (${RECYCLING_GROUPS.length} groups, ${Object.keys(CATEGORY_RECYCLING_MAP).length} mapped categories, ${statuses.length} statuses)`,
);
console.log(
  REMOVAL_ORDERING_ENABLED
    ? "    הזמנת פינוי פעילה ללקוחות."
    : "    הזמנת פינוי כבויה — הלקוח רואה את הזכאות ואת הטלפון, ואין תיבת סימון.",
);
