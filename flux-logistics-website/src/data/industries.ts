export type Industry = {
  slug: string;
  name: string;
  description: string;
  needs: string[];
  relatedServices: string[]; // service slugs
};

export const industries: Industry[] = [
  {
    slug: "flooring-building-materials",
    name: "Flooring, Carpet & Building Materials",
    description:
      "Manufacturers, distributors, and retailers moving carpet padding, carpet rolls, underlayment, and other bulky building products that often require driver-assisted or hand-unload delivery.",
    needs: [
      "Driver-assisted or hand-unload delivery coordination",
      "Dry, clean trailers for moisture- and odor-sensitive materials",
      "Recurring distribution lanes to retail and installation locations",
      "Multi-stop routing across regional distributors",
    ],
    relatedServices: ["carpet-padding-flooring", "driver-assisted-freight", "dedicated-transportation"],
  },
  {
    slug: "manufacturing-industrial",
    name: "Manufacturing & Industrial",
    description:
      "Production facilities that need dependable inbound raw-material delivery and outbound finished-goods shipping on a predictable schedule.",
    needs: [
      "Just-in-time delivery aligned to production schedules",
      "Dedicated or recurring lane capacity",
      "Flatbed and heavy-haul support for machinery and components",
      "Emergency freight when a production line is at risk",
    ],
    relatedServices: ["just-in-time-transportation", "dedicated-transportation", "heavy-haul", "expedited-freight"],
  },
  {
    slug: "retail-distribution",
    name: "Retail & Distribution",
    description:
      "Retailers and distribution centers with strict appointment scheduling, dock-scheduling systems, and high-volume recurring lanes.",
    needs: [
      "Appointment-critical delivery windows",
      "Drop trailer and drop-and-hook programs",
      "Multi-stop truckload routing",
      "Lumper-service coordination at high-volume DCs",
    ],
    relatedServices: ["just-in-time-transportation", "drop-trailer-programs", "dry-van-truckload"],
  },
  {
    slug: "construction-job-site",
    name: "Construction & Job-Site Delivery",
    description:
      "General contractors and material suppliers delivering directly to active job sites with limited access and non-standard unloading conditions.",
    needs: [
      "Job-site delivery coordination",
      "Driver-assisted unloading where approved",
      "Phased, multi-stop delivery scheduling",
      "Flatbed and oversized equipment for construction materials",
    ],
    relatedServices: ["driver-assisted-freight", "project-freight", "flatbed-specialized-transportation"],
  },
  {
    slug: "chemical-hazmat",
    name: "Chemical & Hazmat Shippers",
    description:
      "Shippers of regulated materials that require certified carriers, proper placarding, and complete documentation on every load.",
    needs: [
      "Hazmat-endorsed carriers and drivers",
      "Proper classification, placarding, and shipping papers",
      "Routing awareness for hazmat-restricted corridors",
    ],
    relatedServices: ["hazmat-freight", "dry-van-truckload"],
  },
  {
    slug: "automotive-machinery",
    name: "Automotive & Machinery",
    description:
      "Shippers of vehicles, machinery, and industrial components requiring specialized equipment and, at times, oversized permitting.",
    needs: [
      "Flatbed, step deck, and RGN equipment",
      "Oversized and heavy-haul permitting",
      "High-value freight handling and carrier vetting",
    ],
    relatedServices: ["heavy-haul", "oversized-freight", "high-value-freight"],
  },
  {
    slug: "government-project-cargo",
    name: "Government & Project Cargo",
    description:
      "Complex shipments involving multiple stops, mixed equipment, and coordinated delivery sequencing for public-sector and large-scale projects.",
    needs: [
      "Multi-stop, multi-phase project coordination",
      "Mixed equipment sourcing (dry van, flatbed, oversized)",
      "Detailed documentation and communication across stakeholders",
    ],
    relatedServices: ["project-freight", "oversized-freight", "dedicated-transportation"],
  },
  {
    slug: "furniture-home-goods",
    name: "Furniture & Home Goods",
    description:
      "Furniture, home goods, and similar bulky-but-lightweight product shippers facing many of the same handling challenges as flooring freight.",
    needs: [
      "Driver-assisted or inside delivery where approved",
      "Trailer-capacity planning for high-cube, low-weight freight",
      "Retail and residential-adjacent delivery coordination",
    ],
    relatedServices: ["driver-assisted-freight", "dry-van-truckload", "dedicated-transportation"],
  },
];
