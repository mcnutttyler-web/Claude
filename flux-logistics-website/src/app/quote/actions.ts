"use server";

import { randomUUID } from "crypto";
import { quoteFormSchema, type QuoteFormValues } from "@/lib/quote-schema";
import { tagLead } from "@/lib/integrations/tagging";
import { notifyAdapter } from "@/lib/integrations/notify";
import { crmAdapter } from "@/lib/integrations/crm";
import type { QuoteLead } from "@/lib/integrations/types";

export type QuoteActionResult =
  | { success: true; leadId: string; flags: string[] }
  | { success: false; error: string };

export async function submitQuoteRequest(values: QuoteFormValues): Promise<QuoteActionResult> {
  const parsed = quoteFormSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: "Please check the highlighted fields and try again." };
  }

  const { tags, flags } = tagLead(parsed.data);

  const lead: QuoteLead = {
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
    source: "quote-form",
    values: parsed.data,
    tags,
    flags,
  };

  await Promise.all([notifyAdapter.notifyTeam(lead), notifyAdapter.confirmCustomer(lead), crmAdapter.saveLead(lead)]);

  return { success: true, leadId: lead.id, flags };
}
