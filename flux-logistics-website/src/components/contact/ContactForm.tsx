"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactFormSchema, type ContactFormValues } from "@/lib/contact-schema";
import { submitContactForm } from "@/app/contact/actions";

const inputClasses =
  "w-full rounded-md border border-brand-200 px-4 py-2.5 text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const labelClasses = "mb-1.5 block text-sm font-semibold text-brand-800";
const errorClasses = "mt-1 text-sm text-red-600";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactFormSchema) });

  async function onSubmit(values: ContactFormValues) {
    const result = await submitContactForm(values);
    if (result.success) {
      setStatus("success");
      reset();
    } else {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-900">
        <p className="font-semibold">Thanks — your message is on its way.</p>
        <p className="mt-1 text-sm">We&apos;ll follow up shortly. For shipment-specific quotes, use the Request a Quote form for the fastest response.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <label className={labelClasses} htmlFor="name">
          Name
        </label>
        <input id="name" className={inputClasses} {...register("name")} />
        {errors.name && <p className={errorClasses}>{errors.name.message}</p>}
      </div>
      <div>
        <label className={labelClasses} htmlFor="company">
          Company
        </label>
        <input id="company" className={inputClasses} {...register("company")} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClasses} htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className={inputClasses} {...register("email")} />
          {errors.email && <p className={errorClasses}>{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClasses} htmlFor="phone">
            Phone
          </label>
          <input id="phone" className={inputClasses} {...register("phone")} />
        </div>
      </div>
      <div>
        <label className={labelClasses} htmlFor="message">
          How can we help?
        </label>
        <textarea id="message" rows={5} className={inputClasses} {...register("message")} />
        {errors.message && <p className={errorClasses}>{errors.message.message}</p>}
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600">Something went wrong. Please try again or call {" "}
          <a href="tel:19376612340" className="font-semibold">937-661-2340</a>.
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-md bg-accent-500 px-6 py-3 font-semibold text-brand-950 transition-colors hover:bg-accent-400 disabled:opacity-60"
      >
        {isSubmitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
