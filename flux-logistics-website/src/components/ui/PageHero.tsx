import { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";

export function PageHero({
  eyebrow,
  title,
  dek,
  children,
  showCtas = true,
}: {
  eyebrow?: string;
  title: string;
  dek?: string;
  children?: ReactNode;
  showCtas?: boolean;
}) {
  return (
    <section className="bg-brand-900 text-white">
      <Container className="py-14 sm:py-20">
        {eyebrow && (
          <p className="mb-3 text-sm font-semibold tracking-wide text-accent-400 uppercase">{eyebrow}</p>
        )}
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
        {dek && <p className="mt-5 max-w-2xl text-lg text-brand-200">{dek}</p>}
        {children}
        {showCtas && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/quote" variant="primary">
              Request a Freight Quote
            </Button>
            <Button href={site.phoneHref} variant="outline">
              Call {site.phone}
            </Button>
          </div>
        )}
      </Container>
    </section>
  );
}
