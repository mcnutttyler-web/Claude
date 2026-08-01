import { site } from "@/data/site";

/** Sanitizes JSON-LD payloads before rendering to a <script> tag. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.email,
    telephone: site.phone,
    description:
      "Flux Logistics is an independent Landstar agency coordinating specialized, driver-assisted and time-critical truckload transportation across the United States.",
    founder: {
      "@type": "Person",
      name: site.owner,
    },
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
    memberOf: {
      "@type": "Organization",
      name: "Landstar System, Inc.",
      url: site.agencyOfUrl,
    },
  };
}

export function localBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${site.url}/#business`,
    name: site.name,
    url: site.url,
    telephone: site.phone,
    email: site.email,
    priceRange: "$$",
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
    founder: site.owner,
  };
}

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${site.url}${item.url}`,
    })),
  };
}

export function faqPageSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

export function serviceSchema(params: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: params.name,
    name: params.name,
    description: params.description,
    url: `${site.url}${params.url}`,
    provider: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
  };
}

export function articleSchema(params: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.headline,
    description: params.description,
    url: `${site.url}${params.url}`,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    author: {
      "@type": "Person",
      name: site.owner,
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
    },
  };
}
