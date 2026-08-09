import { describe, expect, it } from "vitest";
import { normalize, normalizeCardNumber, buildMatchKey } from "./matchKey";

describe("normalize", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalize("  Charizard   EX  ")).toBe("charizard ex");
  });
  it("strips punctuation but keeps digits and slash", () => {
    expect(normalize("Farfetch'd (Holo) #025/165")).toBe("farfetchd holo 025/165");
  });
});

describe("normalizeCardNumber", () => {
  it("keeps leading zeros and slash", () => {
    expect(normalizeCardNumber("025/165")).toBe("025/165");
  });
});

describe("buildMatchKey", () => {
  it("builds a stable pipe-delimited key", () => {
    const key = buildMatchKey({
      name: "Charizard",
      setName: "Obsidian Flames",
      cardNumber: "125/197",
      condition: "Near Mint",
      printing: "Holofoil",
    });
    expect(key).toBe("charizard|obsidian flames|125/197|nm|holo");
  });

  it("is stable regardless of incidental case/whitespace differences", () => {
    const a = buildMatchKey({
      name: "  charizard ",
      setName: "OBSIDIAN FLAMES",
      cardNumber: "125/197",
      condition: "Near Mint",
      printing: "Holofoil",
    });
    const b = buildMatchKey({
      name: "Charizard",
      setName: "Obsidian Flames",
      cardNumber: "125/197",
      condition: "Near Mint",
      printing: "Holofoil",
    });
    expect(a).toBe(b);
  });
});
