/**
 * What GetTransaction said about a payment, in words the owner can read.
 *
 * Only words we can stand behind are translated. GamaLastStatus
 * "approved_temporary" is the one bit status seen on a real row; anything
 * else Gama sends is shown as it came. For a card, Pelecard's own status code
 * and message are shown. Nothing here decides that a payment is charged,
 * cancelled or expired — the reply is shown, and the full reply sits under it.
 */

export type PelecardStatus = {
  /** One line in Hebrew, or null when the reply carried nothing we can read. */
  summary: string | null;
  statusCode: string | null;
  message: string | null;
  gamaStatus: string | null;
  updatedAt: string | null;
  /** The whole reply, for whoever needs to look further. */
  raw: unknown;
};

const GAMA_WORDS: Record<string, string> = {
  approved_temporary: "ביט: אישור זמני – עוד לא נגבה",
};

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Raw;
  if (typeof value === "string") {
    try {
      return obj(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

export function readPelecardStatus(answer: unknown): PelecardStatus {
  const top = obj(answer) ?? {};
  const data = obj(top.ResultData) ?? {};
  const gama = obj(top.GamaData) ?? obj(data.GamaData);

  const statusCode = str(top.StatusCode) ?? str(data.ShvaResult);
  const message = str(top.ErrorMessage);
  const gamaStatus = str(gama?.GamaLastStatus);
  const updatedAt = str(data.TransactionUpdateTime);

  let summary: string | null = null;
  if (gamaStatus) summary = GAMA_WORDS[gamaStatus] ?? `ביט: ${gamaStatus}`;
  else if (statusCode || message) summary = `פלאקארד: ${[statusCode, message].filter(Boolean).join(" – ")}`;

  return { summary, statusCode, message, gamaStatus, updatedAt, raw: answer };
}
