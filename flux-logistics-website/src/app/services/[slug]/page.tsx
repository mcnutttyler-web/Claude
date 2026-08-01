import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicePageTemplate } from "@/components/services/ServicePageTemplate";
import { getServiceBySlug, templatedServices } from "@/data/services";

export function generateStaticParams() {
  return templatedServices.map((s) => ({ slug: s.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service || service.customPage) return {};
  return {
    title: service.metaTitle.replace(" | Flux Logistics", ""),
    description: service.metaDescription,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServiceDetailPage({ params }: Params) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service || service.customPage) {
    notFound();
  }

  return <ServicePageTemplate service={service} />;
}
