import { describe, expect, it } from "vitest";
import { parseCents, formatCents } from "./money";

describe("parseCents", () => {
  it("strips $ and commas", () => {
    expect(parseCents("$1,234.56")).toBe(123456);
  });
  it("handles plain numbers", () => {
    expect(parseCents("0.49")).toBe(49);
  });
  it("handles whitespace", () => {
    expect(parseCents("  $12.00  ")).toBe(1200);
  });
  it("returns null for empty/invalid input", () => {
    expect(parseCents("")).toBeNull();
    expect(parseCents(undefined)).toBeNull();
    expect(parseCents("n/a")).toBeNull();
  });
  it("accepts numeric input directly", () => {
    expect(parseCents(2.5)).toBe(250);
  });
  it("rounds fractional cents", () => {
    expect(parseCents("1.006")).toBe(101);
  });
});

describe("formatCents", () => {
  it("formats dollars and cents", () => {
    expect(formatCents(123456)).toBe("$1234.56");
    expect(formatCents(49)).toBe("$0.49");
  });
  it("handles null", () => {
    expect(formatCents(null)).toBe("—");
  });
});
