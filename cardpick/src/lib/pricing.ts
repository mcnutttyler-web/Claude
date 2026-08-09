export interface PricingSettingsLike {
  lowFloorCents: number;
  p1Bps: number; // basis points, 100 = 1%
  p2Bps: number;
  p3Bps: number;
  roundingMode: "NONE" | "NEAREST_CENT" | "UP_TO_X9";
  hardFloorCents: number;
  stalenessDays: number;
}

/**
 * Bands evaluated top to bottom, first match wins. Boundaries are
 * inclusive on the lower bound, exclusive on the upper.
 */
export function computeSellPriceCents(marketCents: number, settings: PricingSettingsLike): number {
  let raw: number;
  if (marketCents < 49) {
    raw = settings.lowFloorCents;
  } else if (marketCents < 200) {
    raw = marketCents * (1 + settings.p1Bps / 10_000);
  } else if (marketCents < 1000) {
    raw = marketCents * (1 + settings.p2Bps / 10_000);
  } else {
    raw = marketCents * (1 + settings.p3Bps / 10_000);
  }

  const rounded = applyRounding(raw, settings.roundingMode);
  return Math.max(rounded, settings.hardFloorCents);
}

function applyRounding(raw: number, mode: PricingSettingsLike["roundingMode"]): number {
  switch (mode) {
    case "NONE":
      return Math.trunc(raw);
    case "NEAREST_CENT":
      return Math.round(raw);
    case "UP_TO_X9": {
      const ceilCents = Math.ceil(raw);
      return ceilCents - (ceilCents % 10) + 9;
    }
  }
}

/** True when a market price is too old to safely reprice without an explicit override. */
export function isStale(
  marketPriceAsof: string | null,
  stalenessDays: number,
  now: Date = new Date(),
): boolean {
  if (!marketPriceAsof) return true;
  const asof = new Date(marketPriceAsof);
  const diffDays = (now.getTime() - asof.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > stalenessDays;
}
