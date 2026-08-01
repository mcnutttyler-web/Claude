import type { QuoteFormValues } from "@/lib/quote-schema";

export type LeadTag =
  | "driver-assist"
  | "carpet-flooring"
  | "hazmat"
  | "oversized"
  | "expedited"
  | "review-recommended";

export type QuoteLead = {
  id: string;
  submittedAt: string;
  source: "quote-form" | "ai-intake";
  values: QuoteFormValues;
  tags: LeadTag[];
  flags: string[];
};

/**
 * Adapter contracts for future integrations. Each is intentionally a no-op /
 * console-log implementation until real credentials are wired up via env
 * vars — see docs/technical-build-spec.md for the intended providers
 * (CRM, email, file storage). Swap the implementation in
 * src/lib/integrations/*.ts without touching the form or server action.
 */
export interface NotifyAdapter {
  notifyTeam(lead: QuoteLead): Promise<void>;
  confirmCustomer(lead: QuoteLead): Promise<void>;
}

export interface CrmAdapter {
  saveLead(lead: QuoteLead): Promise<{ id: string }>;
}
