import { createHash } from "node:crypto";

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Deterministic signature for a CSV shape, used to auto-match a saved mapping profile. */
export function shapeSignature(headers: string[]): string {
  return sha256Hex([...headers].map((h) => h.trim().toLowerCase()).sort().join("|"));
}
