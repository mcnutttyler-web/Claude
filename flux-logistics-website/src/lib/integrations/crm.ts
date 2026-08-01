import type { CrmAdapter, QuoteLead } from "@/lib/integrations/types";

/**
 * Default adapter: no-op (returns the lead's generated id). Replace with a
 * real CRM integration (HubSpot, Salesforce, a Wix Contacts equivalent,
 * etc.) once credentials are available. See docs/crm-email-workflow.md.
 */
class NullCrmAdapter implements CrmAdapter {
  async saveLead(lead: QuoteLead): Promise<{ id: string }> {
    console.log(`[crm] Lead ${lead.id} ready to save once a CRM adapter is connected.`);
    return { id: lead.id };
  }
}

export const crmAdapter: CrmAdapter = new NullCrmAdapter();
