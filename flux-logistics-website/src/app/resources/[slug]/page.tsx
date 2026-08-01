import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema } from "@/lib/jsonld";
import { articles } from "@/data/resources";
import { site } from "@/data/site";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: article.metaTitle.replace(" | Flux Logistics", ""),
    description: article.metaDescription,
    alternates: { canonical: `/resources/${article.slug}` },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Resources", url: "/resources" },
          { name: article.title, url: `/resources/${article.slug}` },
        ])}
      />
      <JsonLd
        data={articleSchema({
          headline: article.title,
          description: article.metaDescription,
          url: `/resources/${article.slug}`,
          datePublished: article.datePublished,
          dateModified: article.dateModified,
        })}
      />

      <PageHero eyebrow={article.category} title={article.title} dek={article.dek} showCtas={false} />

      <Section tone="white">
        <article className="mx-auto max-w-3xl">
          <p className="mb-8 text-sm text-brand-500">
            Published {new Date(article.datePublished).toLocaleDateString("en-US", { dateStyle: "long" })} by{" "}
            {site.owner} &middot; {site.name}
          </p>
          {article.body.map((block, index) => (
            <div key={index} className="mb-6">
              {block.heading && <h2 className="mb-3 text-xl font-bold text-brand-900">{block.heading}</h2>}
              {block.paragraphs?.map((p, pIndex) => (
                <p key={pIndex} className="mb-4 text-brand-700">
                  {p}
                </p>
              ))}
              {block.list && (
                <ul className="mb-4 list-disc space-y-1.5 pl-6 text-brand-700">
                  {block.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </article>
      </Section>

      <CtaBand />
    </>
  );
}
