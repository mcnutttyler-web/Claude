import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { site } from "@/data/site";

export function CtaBand({
  headline = "Ready to move freight that needs more than a truck?",
  supporting = "Tell us about the shipment and we'll confirm capacity, equipment and handling requirements before it moves.",
}: {
  headline?: string;
  supporting?: string;
}) {
  return (
    <section className="bg-brand-950 py-14 text-white">
      <Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">{headline}</h2>
          <p className="mt-2 max-w-xl text-brand-200">{supporting}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button href="/quote" variant="primary">
            Request a Freight Quote
          </Button>
          <Button href={site.phoneHref} variant="outline">
            Call {site.phone}
          </Button>
        </div>
      </Container>
    </section>
  );
}
