"use server";

import { contactFormSchema, type ContactFormValues } from "@/lib/contact-schema";
import { site } from "@/data/site";

export type ContactActionResult = { success: true } | { success: false; error: string };

export async function submitContactForm(values: ContactFormValues): Promise<ContactActionResult> {
  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, error: "Please check the form and try again." };
  }

  // Notification provider not yet connected — see src/lib/integrations/notify.ts.
  console.log(`[contact] New inquiry for ${site.email}:`, parsed.data);

  return { success: true };
}
