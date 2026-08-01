import Link from "next/link";
import { Eyebrow } from "@/components/ui/Section";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { faqs, homepageFaqSlugs } from "@/data/faqs";

export function FaqPreview() {
  const items = homepageFaqSlugs
    .map((q) => faqs.find((f) => f.q === q))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <div>
      <Eyebrow>Common Questions</Eyebrow>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">Frequently asked questions</h2>
        <Link href="/faq" className="text-sm font-semibold text-accent-600 hover:text-accent-500">
          View all FAQs &rarr;
        </Link>
      </div>
      <div className="mt-8">
        <FaqAccordion items={items} />
      </div>
    </div>
  );
}
