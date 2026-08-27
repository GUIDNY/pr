const ilsFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ilsFormatterDecimal = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(amount: number, opts?: { decimals?: boolean }) {
  return opts?.decimals ? ilsFormatterDecimal.format(amount) : ilsFormatter.format(amount);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatInstallment(price: number, months: number) {
  const perMonth = price / months;
  return `או ${months} תשלומים של ${formatPrice(perMonth)}`;
}

// A "מבצע" flash over a 3% price difference (3,200 → 3,090) reads as a
// manipulation rather than an offer, and it spends the credibility of every
// genuine discount on the site alongside it. Below this, the old price is
// still struck through and the saving is still visible in the numbers —
// it just doesn't get shouted about.
export const MIN_ADVERTISED_DISCOUNT_PERCENT = 5;

export function discountPercent(price: number, compareAt?: number | null) {
  if (!compareAt || compareAt <= price) return null;
  const pct = Math.round(((compareAt - price) / compareAt) * 100);
  return pct >= MIN_ADVERTISED_DISCOUNT_PERCENT ? pct : null;
}
