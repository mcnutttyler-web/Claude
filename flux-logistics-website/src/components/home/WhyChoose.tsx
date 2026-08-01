import { Eyebrow } from "@/components/ui/Section";
import { site } from "@/data/site";

const reasons = [
  {
    title: "Direct owner involvement",
    description: `You work with ${site.owner} directly, not a rotating dispatch queue or a call-center ticket.`,
  },
  {
    title: "Hands-on shipment management",
    description: "We plan around how the freight actually needs to move, not a generic dock-to-dock template.",
  },
  {
    title: "Experience with unusual delivery requirements",
    description: "Driver-assisted unloading, job-site delivery, floor-loaded freight and tight appointment windows are regular work, not exceptions.",
  },
  {
    title: "Nationwide capacity access",
    description: "Backed by Landstar's transportation network, giving us access to a large, vetted carrier base.",
  },
  {
    title: "Communication with drivers and facilities",
    description: "Requirements are confirmed with the carrier and driver before dispatch, and with the receiving facility before delivery.",
  },
  {
    title: "Support for recurring and one-time freight",
    description: "From a single specialized shipment to a dedicated, recurring lane, the same level of attention applies.",
  },
  {
    title: "Landstar-supported transportation capabilities",
    description: "Specialized equipment, hazmat-endorsed carriers, and oversized/permit support sourced through an established network.",
  },
  {
    title: "Clear expectations before a load moves",
    description: "Handling, equipment, and unloading requirements are confirmed before a truck is dispatched, not discovered on arrival.",
  },
];

export function WhyChoose() {
  return (
    <div>
      <Eyebrow dark>Why Flux Logistics</Eyebrow>
      <h2 className="max-w-2xl text-2xl font-bold text-white sm:text-3xl">
        A responsive, owner-led agency backed by Landstar&apos;s network
      </h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {reasons.map((reason) => (
          <div key={reason.title} className="rounded-lg border border-brand-700 bg-brand-800/60 p-5">
            <p className="font-semibold text-white">{reason.title}</p>
            <p className="mt-2 text-sm text-brand-300">{reason.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
