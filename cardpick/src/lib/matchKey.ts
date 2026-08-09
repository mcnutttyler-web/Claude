import { conditionCode, printingCode } from "./condition";

/**
 * lowercase, trim, collapse internal whitespace, strip punctuation except
 * digits and "/".
 */
export function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}/\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Card numbers keep leading zeros and the "/" (e.g. "025/165").
 */
export function normalizeCardNumber(input: string | null | undefined): string {
  return normalize(input);
}

export interface MatchKeyInput {
  name: string;
  setName: string;
  cardNumber?: string | null;
  condition: string;
  printing: string;
}

export function buildMatchKey({
  name,
  setName,
  cardNumber,
  condition,
  printing,
}: MatchKeyInput): string {
  return [
    normalize(name),
    normalize(setName),
    normalizeCardNumber(cardNumber),
    conditionCode(condition),
    printingCode(printing),
  ].join("|");
}
