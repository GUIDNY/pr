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

/**
 * Every date in this product is shown in Israel's time, whoever is looking
 * and wherever the code runs.
 *
 * Omitting `timeZone` does not mean "the user's zone", it means the
 * *runtime's* zone — and these run on Vercel, which is UTC. So a sync that
 * finished at 00:32 on Friday was printed on the inventory screen as
 * "15 באוק׳ 21:32", three hours early and on the wrong day, for a whole
 * weekend before the owner spotted it and had to be talked out of believing
 * it. Eighty-five call sites read these two functions: order dates, article
 * dates, review dates, the price sheets' upload times. They were all wrong
 * together.
 *
 * Pinned rather than left to the viewer, and the difference matters in the
 * other direction too: a component that renders on the server and again in
 * the browser formatted the same instant in two zones and tripped
 * hydration, and a staff member abroad would have read the shop's clock in
 * their own. There is one clock here and it is the shop's.
 *
 * `Asia/Jerusalem` and not a +2 or +3 offset, for the reason office-hours.ts
 * gives: Israel changes its clock twice a year and a formatter knows, while
 * an offset is a bug with a date on it.
 */
const IL = "Asia/Jerusalem";

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: IL,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: IL,
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

export function discountPercent(price: number, compareAt?: number | null) {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
