/**
 * The Chita (courier) shipment queue.
 *
 * Chita has no API token for us, so the site only keeps a queue: pressing
 * "שלח לצ'יטה" on an order marks it REQUESTED, and a Playwright bot on the Mac
 * mini polls /api/chita/jobs, fills Chita's own form, and reports the shipment
 * number back. Pure helpers live here so the route, the action and the admin
 * page agree on the vocabulary.
 */

export const CHITA_STATUSES = ["REQUESTED", "CLAIMED", "DONE", "ERROR"] as const;
export type ChitaStatus = (typeof CHITA_STATUSES)[number];

/** Chita's cargo codes: a parcel up to 25 kg, and an over-weight / bulky load. */
export const CHITA_CARGO_PARCEL = 110;
export const CHITA_CARGO_HEAVY = 150;
export const CHITA_CARGO_LABELS: Record<number, string> = {
  [CHITA_CARGO_PARCEL]: 'חבילה עד 25 ק"ג',
  [CHITA_CARGO_HEAVY]: "משקל חריג",
};

/** A CLAIMED job nobody reported on within this long goes back to the queue. */
export const CHITA_CLAIM_TTL_MS = 15 * 60 * 1000;

export function suggestedCargoCode(anyBulky: boolean): number {
  return anyBulky ? CHITA_CARGO_HEAVY : CHITA_CARGO_PARCEL;
}

export function isChitaStatus(v: string | null | undefined): v is ChitaStatus {
  return !!v && (CHITA_STATUSES as readonly string[]).includes(v);
}

/** A shipment may be requested when nothing is in flight or the last try failed. */
export function canRequestChita(status: string | null | undefined): boolean {
  return !status || status === "ERROR";
}

export type ChitaAddress = {
  city: string;
  street: string;
  house: string;
  entrance: string;
  floor: string;
  apartment: string;
  note: string;
};

const trimmed = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ChitaRequestInput = ChitaAddress & { packages: number; cargoCode: number };

/** Validates what the modal sends. Returns the clean input or a Hebrew error. */
export function parseChitaRequest(raw: unknown): { ok: true; value: ChitaRequestInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const value: ChitaRequestInput = {
    city: trimmed(r.city, 80),
    street: trimmed(r.street, 120),
    house: trimmed(r.house, 20),
    entrance: trimmed(r.entrance, 20),
    floor: trimmed(r.floor, 20),
    apartment: trimmed(r.apartment, 20),
    note: trimmed(r.note, 300),
    packages: Number(r.packages),
    cargoCode: Number(r.cargoCode),
  };
  if (!value.city || !value.street) return { ok: false, error: "חסרה עיר או רחוב" };
  if (!Number.isInteger(value.packages) || value.packages < 1 || value.packages > 20) {
    return { ok: false, error: "מספר אריזות חייב להיות בין 1 ל־20" };
  }
  if (value.cargoCode !== CHITA_CARGO_PARCEL && value.cargoCode !== CHITA_CARGO_HEAVY) {
    return { ok: false, error: "סוג מטען לא תקין" };
  }
  return { ok: true, value };
}

/** What the bot receives per job. Contract: see /api/chita/jobs. */
export type ChitaJob = {
  orderNumber: string;
  name: string;
  phone: string;
  city: string;
  street: string;
  house: string;
  entrance: string;
  floor: string;
  apartment: string;
  note: string;
  packages: number;
  cargoCode: number;
};

/** Chita's "שלב" text means delivered when it says נמסר and not לא נמסר. */
export function stageMeansDelivered(stage: string): boolean {
  return stage.includes("נמסר") && !stage.includes("לא נמסר");
}

/** DD/MM/YYYY in Israel time — the date format Chita's screen filters by. */
export function israelDay(d: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return p; // en-GB gives DD/MM/YYYY
}
