import type { QuoteFormValues } from "@/lib/quote-schema";
import type { LeadTag } from "@/lib/integrations/types";
import { unloadRequiresDriverLabor } from "@/lib/quote-schema";

const FLOORING_KEYWORDS = ["carpet", "padding", "underlayment", "flooring", "rolled goods", "rug"];

/**
 * Deterministic tagging so every lead is routed and labeled consistently,
 * whether it came from the quote form or the AI intake assistant. Mirrors
 * the Wix automation tag list in the spec (driver-assist, carpet/flooring,
 * hazmat, oversized).
 */
export function tagLead(values: QuoteFormValues): { tags: LeadTag[]; flags: string[] } {
  const tags = new Set<LeadTag>();
  const flags: string[] = [];

  if (unloadRequiresDriverLabor(values.unloadResponsibility)) {
    tags.add("driver-assist");
  }

  const commodity = values.commodity.toLowerCase();
  if (FLOORING_KEYWORDS.some((kw) => commodity.includes(kw))) {
    tags.add("carpet-flooring");
  }

  if (values.isHazmat === "yes") tags.add("hazmat");
  if (values.isOversized === "yes") tags.add("oversized");

  if (values.unloadResponsibility === "driver-unload") {
    flags.push("Full driver unload requested — confirm carrier capability before quoting.");
  }
  if (values.forkliftAvailable === "no" && values.driverExpectedToOperateEquipment === "yes") {
    flags.push("Driver expected to operate powered equipment with no forklift on site — requires review before approval.");
  }
  if (values.estimatedUnloadTime && /(\d+)\s*(hour|hr)/i.test(values.estimatedUnloadTime)) {
    const match = values.estimatedUnloadTime.match(/(\d+)\s*(hour|hr)/i);
    const hours = match ? parseInt(match[1], 10) : 0;
    if (hours >= 3) flags.push(`Long estimated unload time (${values.estimatedUnloadTime}) — detention exposure likely.`);
  }
  if (values.isHazmat === "yes" || values.isOversized === "yes") {
    tags.add("review-recommended");
    flags.push("Hazmat or oversized shipment — recommend human review before quoting.");
  }
  if (values.unloadResponsibility === "not-sure") {
    flags.push("Unloading responsibility unknown — confirm with shipper before sourcing capacity.");
  }

  return { tags: Array.from(tags), flags };
}
