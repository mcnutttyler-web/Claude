import type { NotifyAdapter, QuoteLead } from "@/lib/integrations/types";
import { site } from "@/data/site";

/**
 * Default adapter: logs structured lead data server-side. Replace with a
 * real email/SMS provider (e.g. Resend, Postmark, Twilio SendGrid) once an
 * API key is available — set the provider's env var and swap this file's
 * implementation. Nothing in the quote form or server action needs to
 * change when that happens.
 */
class ConsoleNotifyAdapter implements NotifyAdapter {
  async notifyTeam(lead: QuoteLead): Promise<void> {
    console.log(
      `[notify] New quote lead ${lead.id} for ${site.email} — tags: ${lead.tags.join(", ") || "none"}`
    );
  }

  async confirmCustomer(lead: QuoteLead): Promise<void> {
    console.log(`[notify] Confirmation would be sent to ${lead.values.email} for lead ${lead.id}`);
  }
}

export const notifyAdapter: NotifyAdapter = new ConsoleNotifyAdapter();
