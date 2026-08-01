# Flux Logistics Website

Marketing site and quote-intake platform for Flux Logistics, an independent Landstar agency. Built with
Next.js 16 (App Router), TypeScript, Tailwind CSS, React Hook Form, and Zod.

See [`docs/00-deliverables-index.md`](./docs/00-deliverables-index.md) for the full strategy, positioning,
SEO, and technical documentation set that accompanies this codebase.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev      # local dev server
npm run build    # production build (also runs TypeScript checks)
npm run start    # serve the production build
npm run lint     # ESLint
npx tsc --noEmit # standalone TypeScript check
```

## Structure

- `src/app/` — routes (App Router)
- `src/components/` — UI, organized by domain (layout, home, services, quote, contact, faq, seo, ui)
- `src/data/` — all site copy/content as typed data (services, industries, FAQs, resources, glossary,
  site config) — edit these files to change content without touching layout code
- `src/lib/` — Zod schemas, JSON-LD builders, and integration adapters
- `docs/` — strategy, positioning, SEO, AI-search, technical spec, compliance, and roadmap documents

## Content model

Nearly all copy lives in `src/data/*.ts`, not inline in page components. To update a service page's
copy, edit its entry in `src/data/services.ts` (or, for the two bespoke pages, edit
`src/app/services/driver-assisted-freight/page.tsx` / `carpet-padding-flooring/page.tsx` directly).

## Forms & integrations

The quote form (`/quote`) and contact form (`/contact`) validate with Zod and submit through Next.js
Server Actions. Lead notification (email) and CRM persistence are implemented behind adapter interfaces
(`src/lib/integrations/`) that currently log to the server console — see
[`docs/07-technical-build-spec.md`](./docs/07-technical-build-spec.md) for what's needed to connect real
providers.
