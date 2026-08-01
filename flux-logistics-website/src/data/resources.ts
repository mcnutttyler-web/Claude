export type Article = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  dek: string;
  datePublished: string; // ISO
  dateModified: string; // ISO
  category: "Driver-Assisted Freight" | "Flooring & Rolled Goods" | "Quoting & Pricing" | "Operations";
  /** Markdown-ish content: array of { heading?, paragraphs, list? } blocks rendered in order */
  body: Array<{ heading?: string; paragraphs?: string[]; list?: string[] }>;
};

export const articles: Article[] = [
  {
    slug: "driver-assist-vs-driver-unload",
    title: "Driver Assist vs. Driver Unload: What Shippers Need to Know",
    metaTitle: "Driver Assist vs. Driver Unload: What Shippers Need to Know | Flux Logistics",
    metaDescription:
      "Driver assist and driver unload are not the same thing. Here's how they differ, why the distinction affects pricing and carrier selection, and what to disclose before booking.",
    dek: "Two terms that get used interchangeably in freight conversations, and shouldn't be.",
    datePublished: "2026-01-15",
    dateModified: "2026-01-15",
    category: "Driver-Assisted Freight",
    body: [
      {
        paragraphs: [
          "\"Can the driver help unload?\" is one of the most common questions we get, and it's really two different questions wearing the same sentence. The answer, and the price, depends heavily on which one is actually being asked.",
        ],
      },
      {
        heading: "Driver assist: the driver helps",
        paragraphs: [
          "Driver assist means the driver provides hands-on help moving freight off the trailer, working alongside receiving personnel rather than doing the job alone. It's a shared effort. The receiving location still supplies most of the labor; the driver is there to help with the parts that need an extra set of hands.",
        ],
      },
      {
        heading: "Driver unload: the driver does the job",
        paragraphs: [
          "Driver unload is a bigger commitment. The driver is expected to unload some or all of the shipment largely on their own, without meaningful help from the receiver. That's a different labor expectation, and it requires a carrier who is not just willing but set up to take that on, plus a rate that reflects the added time on-site.",
        ],
      },
      {
        heading: "Why the distinction matters before you book",
        paragraphs: [
          "Carriers price and staff these two scenarios differently. A carrier who agreed to \"help unload\" and shows up to find they're expected to unload 2,000 square feet of flooring alone is going to have a very different conversation with the driver than the one that was planned. That friction shows up as delays, disputes, or a driver who simply declines the job on arrival.",
          "This is why we ask specifically what the driver is expected to physically do, not just whether \"assistance\" is needed. Getting this right before the shipment is booked is what keeps the truck moving and the driver willing to do the job.",
        ],
      },
      {
        heading: "What to have ready",
        list: [
          "What physically needs to happen (carry to a specific room, stack to a certain height, etc.)",
          "Roughly how many pieces, rolls, or units are involved",
          "Whether anyone at the facility will help",
          "Whether a pallet jack or other non-powered equipment is available",
          "Estimated unloading time",
        ],
      },
      {
        paragraphs: [
          "Driver assistance of any kind is subject to carrier and driver approval and must be confirmed before dispatch, along with any resulting rate adjustment. See our Driver-Assisted Freight page for the full breakdown, including how this differs from lumper service and customer unload.",
        ],
      },
    ],
  },
  {
    slug: "driver-assist-vs-lumper-service",
    title: "Driver Assist vs. Lumper Service",
    metaTitle: "Driver Assist vs. Lumper Service: What's the Difference? | Flux Logistics",
    metaDescription:
      "Driver assist and lumper service both add labor to an unload, but they use different people and change different parts of the shipment plan.",
    dek: "Same problem, different labor source, different planning.",
    datePublished: "2026-01-22",
    dateModified: "2026-01-22",
    category: "Driver-Assisted Freight",
    body: [
      {
        paragraphs: [
          "When a shipment needs help getting unloaded, there are two common ways to solve it: the driver pitches in, or a separate crew is hired to do it. Both solve the same underlying problem, limited labor at the receiving dock, but they work very differently.",
        ],
      },
      {
        heading: "Driver assist",
        paragraphs: [
          "The truck driver personally helps with the unload. This depends on the driver's willingness, the carrier's approval, and often the amount of physical labor involved. It works well for moderate unloading needs where a receiving crew is present but needs extra hands.",
        ],
      },
      {
        heading: "Lumper service",
        paragraphs: [
          "A lumper is a third-party worker or crew, arranged and paid for separately, brought in specifically to unload the trailer. The driver is not doing the physical labor. This is common at high-volume distribution centers and for shipments where the unload is too large or too specialized for a driver to reasonably take on.",
        ],
      },
      {
        heading: "How to decide which one fits",
        list: [
          "Small-to-moderate labor need, receiving crew present but short-handed → driver assist may fit",
          "Large volume, no receiving crew, or a facility that requires third-party labor → lumper service",
          "Uncertain? Tell us what the receiving location can and can't provide, and we'll help sort out the right approach",
        ],
      },
      {
        paragraphs: [
          "Whichever route fits, the labor requirement needs to be identified before the truck is dispatched. Lumper coordination is arranged as part of the shipment plan when a facility requires third-party unloading labor.",
        ],
      },
    ],
  },
  {
    slug: "how-to-quote-floor-loaded-freight",
    title: "How to Quote Floor-Loaded Freight",
    metaTitle: "How to Quote Floor-Loaded Freight | Flux Logistics",
    metaDescription:
      "Floor-loaded freight takes longer to unload and needs a different quoting approach than palletized truckload. Here's what to gather before you ask for a rate.",
    dek: "Floor-loaded shipments live and die by the details you provide before the truck is booked.",
    datePublished: "2026-02-03",
    dateModified: "2026-02-03",
    category: "Quoting & Pricing",
    body: [
      {
        paragraphs: [
          "Floor-loaded freight, product loaded directly onto the trailer floor rather than stacked on pallets, is common with carpet padding, rolled goods, and other bulky building materials. It's also one of the easiest shipment types to underquote, because it doesn't behave like a standard palletized truckload once it reaches the dock.",
        ],
      },
      {
        heading: "Why floor-loaded freight quotes differently",
        list: [
          "It typically takes longer to unload than the same weight in palletized freight",
          "It often uses more trailer volume relative to weight, which affects trailer selection",
          "It may require driver assistance if the receiving dock has limited labor",
          "Multiple stops with partial floor-loaded unloads take longer at each stop",
        ],
      },
      {
        heading: "What we ask for before quoting",
        list: [
          "Commodity and packaging (rolls, bundles, loose cartons, etc.)",
          "Approximate piece or roll count",
          "Total weight and cubic volume, if known",
          "Who is unloading: receiver, driver assistance, full driver unload, or lumper",
          "Estimated unloading time, if the shipper has historical data",
          "Dock conditions at delivery (dock height, equipment available)",
        ],
      },
      {
        paragraphs: [
          "The more of this we have up front, the more accurately we can match the shipment with a carrier who is equipped, willing, and priced correctly for the actual unload, not just the linehaul.",
        ],
      },
    ],
  },
  {
    slug: "how-carpet-padding-is-transported",
    title: "How Carpet Padding Is Transported",
    metaTitle: "How Is Carpet Padding Transported? | Flux Logistics",
    metaDescription:
      "Carpet padding moves differently than most palletized freight. Here's how it's typically loaded, what trailer types are used, and what to plan for at delivery.",
    dek: "Bulky, light, and often floor loaded, carpet padding freight has its own set of rules.",
    datePublished: "2026-02-10",
    dateModified: "2026-02-10",
    category: "Flooring & Rolled Goods",
    body: [
      {
        paragraphs: [
          "Carpet padding is bulky relative to its weight, which means trailer space, not weight, is usually the limiting factor. That single fact drives most of the differences between shipping carpet padding and shipping a standard palletized product.",
        ],
      },
      {
        heading: "How it's typically loaded",
        paragraphs: [
          "Carpet padding often ships floor loaded rather than palletized, stacked directly on the trailer floor to maximize the cube. Some shippers palletize for easier handling; others floor load to fit more product per load. Either way, the loading method should be confirmed before the trailer is sourced, since it affects both trailer selection and expected unloading time.",
        ],
      },
      {
        heading: "Trailer requirements",
        list: [
          "A dry, clean trailer free of moisture, odor, or prior residue",
          "Enough cubic capacity for the volume of the shipment, which often matters more than weight capacity",
          "A trailer condition suitable for a moisture-sensitive product",
        ],
      },
      {
        heading: "What happens at delivery",
        paragraphs: [
          "Delivery locations for carpet padding range from large distribution centers with full unloading crews to smaller retail or job-site locations with little to no dock labor. That range is exactly why unloading expectations need to be confirmed before the truck is dispatched, not discovered when the driver arrives.",
        ],
      },
      {
        paragraphs: [
          "See our Carpet Padding and Flooring Transportation page for the full breakdown of how we plan these shipments, including driver-assisted unloading, recurring distribution lanes, and what we need to quote it accurately.",
        ],
      },
    ],
  },
  {
    slug: "how-unloading-time-affects-truckload-pricing",
    title: "How Unloading Time Affects Truckload Pricing",
    metaTitle: "How Unloading Time Affects Truckload Pricing | Flux Logistics",
    metaDescription:
      "A truck's cost isn't just the miles it drives. Unloading time, detention risk, and labor expectations all factor into an accurate truckload rate.",
    dek: "The dock is part of the cost of the load, not a footnote to it.",
    datePublished: "2026-02-18",
    dateModified: "2026-02-18",
    category: "Quoting & Pricing",
    body: [
      {
        paragraphs: [
          "A truckload rate isn't just a function of distance and weight. Time is money for a driver and a carrier, and time spent sitting at a dock, whether unloading, waiting for a lumper, or waiting on facility staff, is time the truck isn't earning on its next load.",
        ],
      },
      {
        heading: "Where unloading time shows up in a rate",
        list: [
          "Longer unloading times reduce how many loads a driver can run in a given period, which affects carrier pricing",
          "Detention charges apply when a truck is held beyond the agreed free time at a facility",
          "Driver-assisted or driver-unload labor is priced separately from linehaul transportation",
          "Facilities with unpredictable dock schedules carry more built-in risk, which carriers price accordingly",
        ],
      },
      {
        heading: "How to reduce detention exposure",
        list: [
          "Disclose expected unloading time and labor requirements before booking",
          "Confirm appointment times and stick to them on both ends",
          "Have dock labor, pallet jacks, or lumper service ready before the truck arrives",
          "Communicate any known delays as early as possible",
        ],
      },
      {
        paragraphs: [
          "The shipments that get priced most accurately, and run most smoothly, are the ones where unloading expectations were part of the conversation from the start, not an afterthought once the driver was already on-site.",
        ],
      },
    ],
  },
];

export const contentCalendar = [
  "How to Prepare a Job Site for Freight Delivery",
  "What Information Carriers Need Before Accepting a Driver-Unload Load",
  "Common Mistakes When Shipping Flooring Products",
  "When to Use a Lumper Service",
  "What Equipment Is Needed to Unload Carpet Padding?",
  "How to Build a Recurring Flooring-Distribution Program",
  "Drop Trailers for Flooring and Building Materials",
  "How to Photograph Freight for an Accurate Quote",
  "What Drivers Can and Cannot Be Expected to Do During Delivery",
];
