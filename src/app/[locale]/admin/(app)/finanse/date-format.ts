/**
 * "2026-11-22" → "22.11.2026" (pl) or "22/11/2026" (en).
 *
 * Shared by the finance components. Works on the ISO calendar date alone, in
 * UTC, so no time zone can shift the day shown.
 */
export function formatIsoDate(iso: string, locale: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A timestamp as a short date and time, in the request locale. */
export function formatDateTimeLocale(
  value: Date | string,
  locale: string,
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
