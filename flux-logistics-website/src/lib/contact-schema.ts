import { z } from "zod";

export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().optional(),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().optional(),
  message: z.string().min(1, "Tell us a little about what you need"),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
