/**
 * All prices are stored as integer cents. Never floats, never REAL columns.
 * These helpers are the only place string <-> cents conversion should happen.
 */

/** Parse a raw CSV money string ("$1,234.50", " 12.5 ", "") into integer cents. */
export function parseMoneyToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export function centsToDollarsString(cents: number | null | undefined): string {
  if (cents == null) return "";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${negative ? "-" : ""}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

export function centsToNumber(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return cents / 100;
}
