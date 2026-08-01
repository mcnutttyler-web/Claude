import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { site } from "@/data/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-950 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(135deg, transparent 40%, rgba(245,160,18,0.35) 100%)",
        }}
        aria-hidden="true"
      />
      <Container className="relative py-20 sm:py-28">
        <p className="mb-4 text-sm font-semibold tracking-wide text-accent-400 uppercase">
          An Independent Landstar Agency
        </p>
        <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          Specialized Freight. Hands-On Service. Nationwide Capacity.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-brand-200 sm:text-xl">
          {site.supportingStatement}
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Button href="/quote" variant="primary" className="text-lg">
            Request a Freight Quote
          </Button>
          <Button href={site.phoneHref} variant="outline" className="text-lg">
            Call {site.phone}
          </Button>
        </div>
        <p className="mt-6 text-sm text-brand-300">
          Work directly with {site.owner} &mdash; not a call center.
        </p>
      </Container>
    </section>
  );
}
