import { describe, expect, it } from "vitest";
import { splitConditionAndPrinting, conditionCode, printingCode } from "./condition";

describe("splitConditionAndPrinting", () => {
  it("splits a plain condition with no printing suffix", () => {
    expect(splitConditionAndPrinting("Near Mint")).toEqual({
      condition: "Near Mint",
      printing: "Normal",
    });
  });
  it("splits Near Mint Foil", () => {
    expect(splitConditionAndPrinting("Near Mint Foil")).toEqual({
      condition: "Near Mint",
      printing: "Foil",
    });
  });
  it("splits Lightly Played Reverse Holofoil", () => {
    expect(splitConditionAndPrinting("Lightly Played Reverse Holofoil")).toEqual({
      condition: "Lightly Played",
      printing: "Reverse Holofoil",
    });
  });
  it("splits 1st Edition Holofoil suffixes", () => {
    expect(splitConditionAndPrinting("Near Mint 1st Edition Holofoil")).toEqual({
      condition: "Near Mint",
      printing: "1st Edition Holofoil",
    });
  });
  it("falls back gracefully for unknown condition prefixes", () => {
    expect(splitConditionAndPrinting("Unopened")).toEqual({
      condition: "Unopened",
      printing: "Normal",
    });
  });
});

describe("conditionCode / printingCode", () => {
  it("maps canonical conditions to short codes", () => {
    expect(conditionCode("Near Mint")).toBe("nm");
    expect(conditionCode("Heavily Played")).toBe("hp");
  });
  it("maps canonical printings to short codes", () => {
    expect(printingCode("Reverse Holofoil")).toBe("revholo");
    expect(printingCode("Normal")).toBe("norm");
  });
});
