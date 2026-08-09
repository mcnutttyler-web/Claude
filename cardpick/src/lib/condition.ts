/**
 * TCGplayer fuses printing into the condition string, e.g. "Near Mint Foil",
 * "Lightly Played Reverse Holofoil". This table splits the base condition
 * from the printing suffix before match_key is built.
 */

export const CANONICAL_CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

export type CanonicalCondition = (typeof CANONICAL_CONDITIONS)[number];

const CONDITION_CODES: Record<CanonicalCondition, string> = {
  "Near Mint": "nm",
  "Lightly Played": "lp",
  "Moderately Played": "mp",
  "Heavily Played": "hp",
  Damaged: "dmg",
};

// Known printing suffixes -> canonical printing name. Extend as new
// suffixes are observed in real TCGplayer exports.
const PRINTING_SUFFIX_MAP: Record<string, string> = {
  "": "Normal",
  foil: "Foil",
  holofoil: "Holofoil",
  "reverse holofoil": "Reverse Holofoil",
  "1st edition": "1st Edition",
  "1st edition holofoil": "1st Edition Holofoil",
  unlimited: "Unlimited",
  "unlimited holofoil": "Unlimited Holofoil",
  "non-holofoil": "Normal",
  normal: "Normal",
};

const PRINTING_CODES: Record<string, string> = {
  Normal: "norm",
  Foil: "foil",
  Holofoil: "holo",
  "Reverse Holofoil": "revholo",
  "1st Edition": "1st",
  "1st Edition Holofoil": "1stholo",
  Unlimited: "unl",
  "Unlimited Holofoil": "unlholo",
};

export interface SplitConditionPrinting {
  condition: CanonicalCondition | string;
  printing: string;
}

/**
 * Splits a raw TCGplayer condition string (which may have printing baked
 * in) into { condition, printing }. Falls back to treating the whole
 * string as the condition with printing = "Normal" if no known base
 * condition prefix matches.
 */
export function splitConditionAndPrinting(raw: string): SplitConditionPrinting {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  const base = CANONICAL_CONDITIONS.find((c) => lower.startsWith(c.toLowerCase()));
  if (!base) {
    return { condition: trimmed, printing: "Normal" };
  }

  const remainder = trimmed.slice(base.length).trim();
  const remainderKey = remainder.toLowerCase().replace(/\s+/g, " ");
  const printing = PRINTING_SUFFIX_MAP[remainderKey] ?? (remainder || "Normal");

  return { condition: base, printing };
}

export function conditionCode(condition: string): string {
  return (
    CONDITION_CODES[condition as CanonicalCondition] ??
    condition.trim().toLowerCase().replace(/\s+/g, "-")
  );
}

export function printingCode(printing: string): string {
  return PRINTING_CODES[printing] ?? printing.trim().toLowerCase().replace(/\s+/g, "-");
}
