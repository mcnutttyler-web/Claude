import { describe, expect, it } from "vitest";
import { computeSellPriceCents, isStale } from "./pricing";

const base = {
  lowFloorCents: 49,
  p1Bps: 0,
  p2Bps: 0,
  p3Bps: 0,
  roundingMode: "UP_TO_X9" as const,
  hardFloorCents: 49,
  stalenessDays: 30,
};

describe("computeSellPriceCents bands", () => {
  it("floors anything under $0.49", () => {
    expect(computeSellPriceCents(10, base)).toBe(49);
    expect(computeSellPriceCents(48, base)).toBe(49);
  });

  it("applies p1 in the $0.49–$2.00 band", () => {
    expect(computeSellPriceCents(100, { ...base, p1Bps: 1000 })).toBe(119); // 1.10 -> up to .19
  });

  it("applies p2 in the $2.00–$10.00 band", () => {
    expect(computeSellPriceCents(500, { ...base, p2Bps: 2000 })).toBe(609); // 6.00 -> up to .09
  });

  it("applies p3 at $10.00 and above", () => {
    expect(computeSellPriceCents(1000, { ...base, p3Bps: 500 })).toBe(1059); // 10.50 -> .59
  });

  it("boundary at exactly $2.00 uses p2, not p1", () => {
    expect(computeSellPriceCents(200, { ...base, p1Bps: 10_000, p2Bps: 0 })).toBe(209);
  });
});

describe("rounding modes", () => {
  it("NONE truncates", () => {
    expect(computeSellPriceCents(233, { ...base, roundingMode: "NONE", p1Bps: 0 })).toBe(233);
  });
  it("NEAREST_CENT rounds", () => {
    expect(
      computeSellPriceCents(233, { ...base, roundingMode: "NEAREST_CENT", p2Bps: 0 }),
    ).toBe(233);
  });
  it("UP_TO_X9 rounds up to the next ...9 ending, never down", () => {
    expect(computeSellPriceCents(1230, base)).toBe(1239);
    expect(computeSellPriceCents(1239, base)).toBe(1239);
    expect(computeSellPriceCents(1200, base)).toBe(1209);
  });
});

describe("hard floor", () => {
  it("never returns below the configured hard floor", () => {
    expect(computeSellPriceCents(60, { ...base, hardFloorCents: 99 })).toBe(99);
  });
});

describe("isStale", () => {
  it("treats missing as-of date as stale", () => {
    expect(isStale(null, 30)).toBe(true);
  });
  it("is not stale within the window", () => {
    const now = new Date("2026-08-09");
    expect(isStale("2026-07-20", 30, now)).toBe(false);
  });
  it("is stale past the window", () => {
    const now = new Date("2026-08-09");
    expect(isStale("2026-06-01", 30, now)).toBe(true);
  });
});
