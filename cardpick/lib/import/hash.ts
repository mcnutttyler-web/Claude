import { createHash } from "node:crypto";

export function sha256(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}
