import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { primaryServices } from "@/data/services";
import { articles } from "@/data/resources";

const staticRoutes = [
  "",
  "/about",
  "/services",
  "/industries",
  "/quote",
  "/resources",
  "/faq",
  "/contact",
  "/privacy-policy",
  "/terms-and-conditions",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${site.url}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/quote" ? 0.9 : 0.7,
  }));

  const serviceEntries: MetadataRoute.Sitemap = primaryServices.map((service) => ({
    url: `${site.url}/services/${service.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${site.url}/resources/${article.slug}`,
    lastModified: new Date(article.dateModified),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [...staticEntries, ...serviceEntries, ...articleEntries];
}
