export type ServiceFaq = { q: string; a: string };

export type Service = {
  slug: string;
  navLabel: string;
  title: string;
  shortDescription: string;
  metaTitle: string;
  metaDescription: string;
  priority: "primary" | "secondary";
  /** true = has a bespoke hand-written page component, not the shared template */
  customPage?: boolean;
  keywords: string[];
  intro: string[];
  goodFit: string[];
  capabilities: string[];
  process: string[];
  needToQuote: string[];
  considerations: string[];
  faqs: ServiceFaq[];
  related: string[];
};

export const services: Service[] = [
  {
    slug: "driver-assisted-freight",
    navLabel: "Driver-Assisted Freight",
    title: "Driver-Assisted Freight & Specialized Delivery",
    shortDescription:
      "Coordinated driver-assisted unloading, hand-unload delivery and specialized delivery requirements for freight that needs more than a dock and a pallet jack.",
    metaTitle: "Driver-Assisted Freight & Driver-Unload Trucking | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates driver-assisted unloading, hand-unload freight and specialized delivery requirements. Learn how driver assist, driver unload, lumper service and customer unload differ.",
    priority: "primary",
    customPage: true,
    keywords: [],
    intro: [],
    goodFit: [],
    capabilities: [],
    process: [],
    needToQuote: [],
    considerations: [],
    faqs: [],
    related: ["carpet-padding-flooring", "dedicated-transportation", "just-in-time-transportation"],
  },
  {
    slug: "carpet-padding-flooring",
    navLabel: "Carpet Padding & Flooring",
    title: "Carpet Padding, Flooring & Rolled-Goods Transportation",
    shortDescription:
      "Transportation for carpet padding, carpet rolls, underlayment and other bulky flooring materials, coordinated around real unloading conditions.",
    metaTitle: "Carpet Padding & Flooring Freight Transportation | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates transportation for carpet padding, carpet rolls, underlayment and rolled flooring goods, including driver-assisted unloading and recurring distribution lanes.",
    priority: "primary",
    customPage: true,
    keywords: [],
    intro: [],
    goodFit: [],
    capabilities: [],
    process: [],
    needToQuote: [],
    considerations: [],
    faqs: [],
    related: ["driver-assisted-freight", "dedicated-transportation", "dry-van-truckload"],
  },
  {
    slug: "hazmat-freight",
    navLabel: "Hazmat Freight",
    title: "Hazmat Freight Transportation",
    shortDescription:
      "Compliance-driven transportation for hazardous materials shipments, coordinated with carriers holding the right certifications and equipment.",
    metaTitle: "Hazmat Freight Transportation Services | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates hazmat freight transportation with carriers qualified to handle regulated materials, proper placarding and documentation from pickup to delivery.",
    priority: "primary",
    keywords: [
      "hazmat freight transportation",
      "hazmat trucking",
      "hazardous materials carrier",
      "DOT hazmat shipping",
      "placarded freight",
    ],
    intro: [
      "Hazardous materials shipments carry regulatory requirements that a standard truckload does not: proper classification, placarding, documentation, and a carrier and driver holding the correct hazmat endorsements. A load that is mishandled or paired with the wrong carrier creates compliance exposure for everyone attached to it.",
      "Flux Logistics sources hazmat-qualified capacity through Landstar's network and confirms classification, packaging group, and documentation requirements with the shipper before a truck is dispatched. The goal is a shipment that is compliant end to end, not just fast.",
    ],
    goodFit: [
      "The shipment includes a DOT-regulated hazard class",
      "The commodity requires specific placarding or segregation from other freight",
      "The shipper needs a carrier and driver with current hazmat endorsements",
      "Documentation (SDS, shipping papers, emergency response information) must travel with the load",
      "The lane involves tunnels, bridges, or routing restrictions tied to hazard class",
    ],
    capabilities: [
      "Access to Landstar-affiliated carriers and owner-operators holding current hazmat endorsements",
      "Coordination of proper placarding based on the shipment's hazard class and packing group",
      "Confirmation that required shipping papers and safety data sheets accompany the load",
      "Routing awareness for hazmat-restricted corridors, tunnels, and bridges",
      "Support for dry van, flatbed, and tank-capable equipment depending on the commodity",
    ],
    process: [
      "Confirm the proper shipping name, hazard class, packing group, and UN/NA number with the shipper",
      "Verify packaging, placarding, and documentation requirements before sourcing capacity",
      "Match the shipment with a carrier and driver holding the applicable hazmat endorsement",
      "Communicate handling and routing restrictions to the carrier in the operating instructions",
      "Track the shipment through delivery and confirm receipt of hazmat documentation",
    ],
    needToQuote: [
      "Proper shipping name, hazard class, and UN/NA number",
      "Packing group and quantity per package",
      "Total shipment weight and packaging type",
      "Pickup and delivery locations, dates, and appointment requirements",
      "Any routing restrictions specific to the facility or region",
    ],
    considerations: [
      "Hazmat capacity is subject to carrier certification, equipment, and availability.",
      "Some hazard classes and quantities require specialized equipment that must be confirmed before booking.",
      "Rates for hazmat freight reflect the compliance and handling requirements of the specific commodity.",
    ],
    faqs: [
      {
        q: "Does Flux Logistics handle all hazard classes?",
        a: "Capacity depends on the specific hazard class, packing group, and quantity involved. Share the shipment's classification details and we will confirm whether qualified capacity is available for that lane.",
      },
      {
        q: "Who is responsible for proper classification and documentation?",
        a: "The shipper is responsible for correctly classifying the commodity and providing accurate shipping papers. Flux Logistics confirms that documentation is in order and reflected in the carrier's operating instructions before dispatch.",
      },
      {
        q: "Can hazmat freight also require driver-assisted unloading?",
        a: "Yes, and when it does, both the hazmat handling requirements and the unloading expectations need to be disclosed and confirmed with the carrier before the shipment is booked.",
      },
    ],
    related: ["oversized-freight", "high-value-freight", "dry-van-truckload"],
  },
  {
    slug: "oversized-freight",
    navLabel: "Oversized Freight",
    title: "Oversized & Over-Dimensional Freight",
    shortDescription:
      "Permitting, routing, and equipment planning for freight that exceeds standard legal dimensions or weight.",
    metaTitle: "Oversized & Over-Dimensional Freight Transportation | Flux Logistics",
    metaDescription:
      "Flux Logistics plans and coordinates oversized and over-dimensional freight, including permitting, routing, escorts, and specialized trailer sourcing.",
    priority: "primary",
    keywords: [
      "oversized freight shipping",
      "over-dimensional trucking",
      "superload transportation",
      "oversize permit trucking",
      "wide load shipping",
    ],
    intro: [
      "Freight that exceeds standard legal height, width, length, or weight requires planning most truckload shipments never touch: state-by-state permitting, route surveys, and in some cases pilot cars or escorts. Getting any part of this wrong causes delays, fines, or a load that cannot legally move on the planned route.",
      "Flux Logistics plans oversized moves around the dimensions and route involved, sourcing the trailer type the load actually needs and confirming permit and escort requirements before the shipment is dispatched.",
    ],
    goodFit: [
      "The load exceeds standard legal dimensions for height, width, or length",
      "The shipment requires state permits to move legally",
      "The route may require pilot cars, escorts, or travel-time restrictions",
      "Specialized trailers (RGN, step deck, extendable) are needed to carry the load",
      "The freight requires a route survey before a truck can be committed",
    ],
    capabilities: [
      "Access to specialized flatbed, step deck, RGN, and extendable trailer capacity through Landstar's network",
      "Coordination of state permitting based on the load's dimensions and route",
      "Awareness of escort and pilot car requirements tied to width, height, and length thresholds",
      "Routing coordination around bridge, overpass, and road restrictions",
      "Communication of securement and tie-down requirements to the carrier",
    ],
    process: [
      "Collect exact dimensions, weight, and load configuration from the shipper",
      "Determine the trailer type and any permits, escorts, or route restrictions required",
      "Source qualified specialized capacity for the specific load",
      "Confirm permit lead time and routing before committing to a delivery window",
      "Monitor the shipment through delivery, including any required route notifications",
    ],
    needToQuote: [
      "Exact length, width, height, and weight of the load, including any overhang",
      "Number of pieces and whether the load can be broken down",
      "Pickup and delivery locations and any access restrictions",
      "Target pickup and delivery dates, with flexibility noted if permitting affects timing",
      "Photos or drawings of the load when available",
    ],
    considerations: [
      "Permit approval times vary by state and can affect the earliest available pickup or delivery date.",
      "Escort and pilot car requirements depend on the specific dimensions and states involved.",
      "Oversized freight pricing reflects permitting, escort, and specialized equipment costs, and is confirmed after dimensions are reviewed.",
    ],
    faqs: [
      {
        q: "How far in advance do oversized loads need to be planned?",
        a: "It depends on the states involved and the permits required. Sharing exact dimensions and the target ship date as early as possible gives us the best chance of securing permits and equipment on schedule.",
      },
      {
        q: "Do oversized loads require an escort?",
        a: "Escort requirements depend on the load's width, height, length, and the states it travels through. We confirm this during route planning, not after a truck is booked.",
      },
      {
        q: "What equipment is used for oversized freight?",
        a: "Depending on the load, this may include step deck, RGN (removable gooseneck), extendable, or double-drop trailers. Equipment is matched to the load's dimensions and weight distribution.",
      },
    ],
    related: ["heavy-haul", "flatbed-specialized-transportation", "project-freight"],
  },
  {
    slug: "heavy-haul",
    navLabel: "Heavy Haul",
    title: "Heavy Haul Transportation",
    shortDescription:
      "Capacity and planning for high-weight freight requiring specialized trailers, axle configurations, and permitting.",
    metaTitle: "Heavy Haul Trucking Services | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates heavy haul transportation for high-weight freight, including specialized trailers, axle planning, and permit coordination.",
    priority: "primary",
    keywords: [
      "heavy haul trucking",
      "heavy equipment transport",
      "RGN trailer shipping",
      "heavy haul permits",
      "machinery transport",
    ],
    intro: [
      "Heavy haul freight, machinery, industrial equipment, and other high-weight loads, requires more than a bigger truck. Axle spacing, trailer configuration, and permitting all depend on the exact weight and how it is distributed across the load.",
      "Flux Logistics works with carriers equipped for heavy haul moves and plans each shipment around weight distribution, permitting, and route capability before a truck is committed.",
    ],
    goodFit: [
      "The shipment's weight exceeds standard truckload limits",
      "The load requires a multi-axle trailer configuration",
      "Weight distribution and axle spacing affect permit approval",
      "The freight includes machinery, industrial equipment, or heavy components",
      "The route needs to be evaluated for bridge and road weight limits",
    ],
    capabilities: [
      "Access to RGN, multi-axle, and specialized heavy-haul trailer capacity",
      "Coordination of weight-based permitting across the states involved",
      "Route evaluation for bridge and road weight restrictions",
      "Communication of loading, securement, and weight-distribution requirements to the carrier",
      "Support for machinery and equipment moves requiring cranes or specialized loading",
    ],
    process: [
      "Collect total weight, axle-by-axle weight distribution, and dimensions",
      "Determine trailer type and permit requirements based on weight and route",
      "Source carriers with the appropriate heavy-haul equipment and experience",
      "Confirm loading and unloading logistics, including any crane or rigging needs",
      "Monitor the shipment through delivery",
    ],
    needToQuote: [
      "Total weight and, where available, axle weight distribution",
      "Dimensions of the load, including any components that must ship separately",
      "Pickup and delivery locations, including road and site access details",
      "Loading and unloading method (crane, forklift, ramp, etc.)",
      "Target pickup and delivery timing",
    ],
    considerations: [
      "Heavy haul routing and permitting depend on the specific states and roads involved and can affect timing.",
      "Some heavy haul freight requires cranes, rigging, or specialized loading equipment coordinated separately from transportation.",
      "Pricing reflects the trailer configuration, permits, and route complexity required for the specific load.",
    ],
    faqs: [
      {
        q: "What counts as heavy haul freight?",
        a: "Generally, freight that exceeds standard legal weight limits and requires a multi-axle trailer configuration to distribute weight and meet permit requirements.",
      },
      {
        q: "Do you handle rigging and crane service?",
        a: "Rigging and crane needs are coordinated as part of the shipment plan when required, though they are typically arranged through specialized providers rather than performed by the carrier.",
      },
    ],
    related: ["oversized-freight", "flatbed-specialized-transportation", "project-freight"],
  },
  {
    slug: "flatbed-specialized-transportation",
    navLabel: "Flatbed & Specialized",
    title: "Flatbed & Specialized Transportation",
    shortDescription:
      "Flatbed, step deck, and specialized trailer capacity for freight that doesn't fit inside a dry van.",
    metaTitle: "Flatbed & Specialized Trucking Services | Flux Logistics",
    metaDescription:
      "Flux Logistics sources flatbed, step deck, and other specialized trailer capacity for freight that requires open-deck transportation, tarping, or non-standard loading.",
    priority: "primary",
    keywords: [
      "flatbed trucking",
      "flatbed freight shipping",
      "step deck trailer",
      "specialized trucking services",
      "open deck freight",
    ],
    intro: [
      "Not every shipment fits inside a box trailer. Building materials, machinery, steel, and other freight that loads from the top or side needs flatbed, step deck, or other open-deck equipment, along with the right tarping, securement, and load planning.",
      "Flux Logistics sources flatbed and specialized capacity matched to the commodity, dimensions, and loading method the shipment actually requires.",
    ],
    goodFit: [
      "The freight loads from the top or side rather than the rear",
      "The shipment requires tarping or weather protection in transit",
      "The load's height or width makes step deck or double-drop equipment a better fit than a dry van",
      "The commodity requires specific securement (chains, straps, dunnage)",
      "The shipper needs flexibility between flatbed, step deck, and conestoga equipment",
    ],
    capabilities: [
      "Flatbed, step deck, double-drop, and conestoga trailer capacity",
      "Coordination of tarping and weather protection for exposed freight",
      "Securement planning based on commodity type and dimensions",
      "Support for loads requiring crane or forklift loading from the side or top",
      "Capacity across regional and long-haul flatbed lanes",
    ],
    process: [
      "Confirm commodity, dimensions, weight, and loading method",
      "Determine the appropriate open-deck trailer type",
      "Source a carrier equipped and experienced with the specific freight type",
      "Communicate tarping, securement, and handling requirements in the operating instructions",
      "Track the shipment through delivery",
    ],
    needToQuote: [
      "Commodity and dimensions",
      "Weight and number of pieces",
      "Loading method (crane, forklift, side-load)",
      "Whether tarping is required",
      "Pickup and delivery locations and target dates",
    ],
    considerations: [
      "Tarping and specialized securement may affect available capacity and pricing.",
      "Some flatbed freight also requires oversized permitting depending on final dimensions.",
    ],
    faqs: [
      {
        q: "What is the difference between flatbed and step deck equipment?",
        a: "Step deck (drop deck) trailers sit lower to the ground, allowing taller freight to stay within legal height limits than it could on a standard flatbed.",
      },
      {
        q: "Do you provide tarps for weather protection?",
        a: "Tarping is coordinated with the carrier when the commodity requires it and is confirmed as part of the quote before the shipment is booked.",
      },
    ],
    related: ["oversized-freight", "heavy-haul", "project-freight"],
  },
  {
    slug: "expedited-freight",
    navLabel: "Expedited Freight",
    title: "Expedited & Time-Critical Freight",
    shortDescription:
      "Fast-moving capacity for shipments with tight pickup and delivery windows or urgent production and repair needs.",
    metaTitle: "Expedited Freight Shipping Services | Flux Logistics",
    metaDescription:
      "Flux Logistics sources expedited, time-critical truckload capacity for urgent shipments, including hot loads, production-line freight, and rush deliveries.",
    priority: "primary",
    keywords: [
      "expedited freight shipping",
      "hot shot trucking",
      "time critical freight",
      "rush truckload shipping",
      "expedited trucking services",
    ],
    intro: [
      "When a shipment cannot wait for a standard truckload schedule, the priority shifts from cost efficiency to speed and certainty. A production line down, a missed appointment, or a time-sensitive delivery all call for capacity that can move immediately and stay in constant communication until delivery.",
      "Flux Logistics sources expedited capacity and stays engaged through pickup and delivery, providing status updates so the shipper always knows where the load stands.",
    ],
    goodFit: [
      "The shipment must move immediately or within a narrow window",
      "A missed delivery would shut down production, a job site, or an event",
      "The freight is replacing a failed part, shipment, or delivery",
      "The customer needs frequent status updates during transit",
      "Standard scheduled capacity will not meet the required timeline",
    ],
    capabilities: [
      "Rapid sourcing of dry van, flatbed, or team-driver capacity depending on urgency",
      "Direct communication with the carrier and driver throughout transit",
      "Real-time status updates for the shipper",
      "Support for after-hours and weekend pickup or delivery when arranged in advance",
      "Coordination with receiving locations to confirm delivery windows",
    ],
    process: [
      "Confirm the shipment's true deadline and any hard appointment requirements",
      "Identify available capacity matched to the timeline",
      "Communicate the urgency and delivery requirements directly to the driver",
      "Provide status updates through pickup, transit, and delivery",
      "Confirm delivery and close out the shipment",
    ],
    needToQuote: [
      "Pickup location and earliest available pickup time",
      "Delivery location and required delivery deadline",
      "Commodity, weight, and dimensions",
      "Whether the shipment requires a specific truck type",
      "Any appointment or receiving restrictions at the destination",
    ],
    considerations: [
      "Expedited capacity and pricing depend on real-time availability and distance to the required pickup location.",
      "Guaranteed delivery times depend on route conditions and are confirmed at booking, not promised in advance of a full review.",
    ],
    faqs: [
      {
        q: "How quickly can an expedited shipment move?",
        a: "It depends on current capacity and the pickup location. Share the timeline and pickup details and we will confirm what is realistically available.",
      },
      {
        q: "Can you provide team drivers for long-distance expedited freight?",
        a: "Team-driver capacity is available when the lane and timeline call for continuous movement without a mandatory rest stop, subject to availability.",
      },
    ],
    related: ["just-in-time-transportation", "dedicated-transportation", "dry-van-truckload"],
  },
  {
    slug: "just-in-time-transportation",
    navLabel: "Just-in-Time",
    title: "Just-in-Time Transportation",
    shortDescription:
      "Precisely scheduled truckload capacity for production, assembly, and retail operations that run on tight delivery windows.",
    metaTitle: "Just-in-Time (JIT) Freight Transportation | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates just-in-time truckload transportation for production and assembly operations that require exact delivery windows and dependable communication.",
    priority: "primary",
    keywords: [
      "just in time freight",
      "JIT trucking",
      "precision delivery trucking",
      "manufacturing freight scheduling",
      "appointment critical freight",
    ],
    intro: [
      "Just-in-time operations run on delivery precision, not just delivery speed. A shipment that arrives an hour early or an hour late can be just as disruptive as one that doesn't arrive at all. This freight requires a carrier and driver who understand the appointment is the deliverable.",
      "Flux Logistics builds JIT moves around the customer's production or receiving schedule, confirming appointment windows with both the carrier and the receiving facility before the load is dispatched.",
    ],
    goodFit: [
      "The delivery must land within a specific appointment window, not just 'on time'",
      "A late or early delivery disrupts a production line, assembly schedule, or retail reset",
      "The lane runs on a recurring, predictable schedule",
      "The receiving facility enforces strict appointment or dock-scheduling requirements",
      "The shipper needs proactive communication if a delay risk emerges in transit",
    ],
    capabilities: [
      "Appointment-based scheduling coordinated with both shipper and receiver",
      "Carrier selection based on reliability for time-sensitive lanes",
      "Proactive in-transit monitoring and communication",
      "Support for recurring JIT lanes and standing pickup schedules",
      "Coordination with dock-scheduling systems used by manufacturing and distribution facilities",
    ],
    process: [
      "Confirm the exact appointment window and any scheduling system requirements",
      "Source a carrier with a track record suited to time-critical delivery",
      "Communicate the appointment as a firm requirement in the operating instructions",
      "Monitor transit and flag any risk to the appointment as early as possible",
      "Confirm delivery against the required window",
    ],
    needToQuote: [
      "Required delivery appointment window",
      "Pickup location and earliest available ship time",
      "Any dock-scheduling system or check-in process used at the receiving facility",
      "Commodity, weight, and equipment type",
      "Whether the lane is a one-time shipment or a recurring schedule",
    ],
    considerations: [
      "Exact delivery times are managed closely but remain subject to road, weather, and route conditions; timelines are confirmed, not guaranteed without qualification.",
      "Recurring JIT lanes benefit from dedicated or drop-trailer capacity, which is evaluated separately.",
    ],
    faqs: [
      {
        q: "How is JIT freight different from expedited freight?",
        a: "Expedited freight is primarily about speed. JIT freight is primarily about precision, hitting a specific appointment window on a recurring or scheduled basis, which sometimes means slowing down as much as speeding up.",
      },
      {
        q: "Can you support a recurring JIT delivery schedule?",
        a: "Yes. Recurring JIT lanes are often paired with dedicated capacity or drop trailer programs to keep the schedule consistent week over week.",
      },
    ],
    related: ["dedicated-transportation", "drop-trailer-programs", "expedited-freight"],
  },
  {
    slug: "drop-trailer-programs",
    navLabel: "Drop Trailer Programs",
    title: "Drop Trailer Programs",
    shortDescription:
      "Staged trailers at your facility for flexible loading and unloading on your schedule, not the truck's.",
    metaTitle: "Drop Trailer Programs & Trailer Pool Management | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates drop trailer programs, staging trailers at shipper or receiver facilities for flexible loading, unloading, and drop-and-hook operations.",
    priority: "primary",
    keywords: [
      "drop trailer program",
      "trailer pool",
      "drop and hook freight",
      "trailer staging",
      "spotted trailer service",
    ],
    intro: [
      "For shippers and receivers who load or unload on their own schedule, waiting on a live truck creates unnecessary friction and detention exposure. A drop trailer program stages trailers at the facility so loading and unloading happen independently of driver availability.",
      "Flux Logistics coordinates drop trailer and trailer pool arrangements for recurring shippers, managing the trailer count and drop-and-hook schedule so freight keeps moving without live-unload bottlenecks.",
    ],
    goodFit: [
      "The facility loads or unloads on its own schedule, not a live truck's",
      "The shipper wants to reduce detention exposure tied to live loading or unloading",
      "The lane runs frequently enough to justify staged trailers",
      "Drop-and-hook operations would improve throughput at the dock",
      "The shipper needs a predictable, standing trailer count at a facility",
    ],
    capabilities: [
      "Coordination of trailer pools staged at shipper or receiver facilities",
      "Drop-and-hook scheduling aligned to loading and unloading volume",
      "Trailer tracking and pool-count management",
      "Integration with recurring or dedicated lanes",
      "Support for both dry van and specialized trailer pools depending on freight type",
    ],
    process: [
      "Evaluate volume and loading/unloading patterns to size the trailer pool",
      "Stage trailers at the facility on an agreed schedule",
      "Coordinate drop-and-hook pickups and swaps as trailers are loaded or emptied",
      "Track trailer locations and turn times",
      "Adjust pool size as volume changes",
    ],
    needToQuote: [
      "Facility location and typical daily/weekly volume",
      "Preferred trailer count and swap frequency",
      "Loading or unloading pattern (hours of operation, dock capacity)",
      "Equipment type needed (dry van, flatbed, etc.)",
      "Whether the program is new or replacing an existing drop trailer arrangement",
    ],
    considerations: [
      "Drop trailer programs are sized around actual volume and are evaluated before committing a standing trailer count.",
      "Trailer availability is subject to capacity across the broader network.",
    ],
    faqs: [
      {
        q: "How many trailers does a drop program need?",
        a: "It depends on volume, loading speed, and how often trailers turn. We review the facility's pattern before recommending a pool size.",
      },
      {
        q: "Can drop trailer programs support flooring or building-material distribution?",
        a: "Yes. Recurring flooring and building-material lanes are a common fit for drop trailer arrangements, especially where dock labor is limited.",
      },
    ],
    related: ["dedicated-transportation", "just-in-time-transportation", "carpet-padding-flooring"],
  },
  {
    slug: "dedicated-transportation",
    navLabel: "Dedicated Transportation",
    title: "Dedicated Transportation & Recurring Lanes",
    shortDescription:
      "Standing capacity and consistent service for shippers running the same lanes week after week.",
    metaTitle: "Dedicated Transportation & Recurring Freight Lanes | Flux Logistics",
    metaDescription:
      "Flux Logistics builds dedicated transportation programs and recurring lane capacity for shippers who need consistent trucks, drivers, and communication week over week.",
    priority: "primary",
    keywords: [
      "dedicated trucking",
      "dedicated freight capacity",
      "recurring freight lanes",
      "contract trucking capacity",
      "consistent truckload capacity",
    ],
    intro: [
      "Recurring freight benefits from consistency: the same lane, the same expectations, and a logistics contact who already understands the shipment. Sourcing a new truck from scratch every week adds risk to freight that should be predictable.",
      "Flux Logistics builds dedicated and recurring lane programs around a shipper's actual volume and schedule, working to keep capacity, communication, and delivery expectations consistent over time.",
    ],
    goodFit: [
      "The same lane or set of lanes runs multiple times per week",
      "The shipper wants consistent equipment and delivery expectations across the program",
      "Rebuilding capacity from scratch each week creates risk or inefficiency",
      "The freight has specific handling or delivery requirements worth standardizing",
      "The shipper is evaluating a longer-term capacity commitment in exchange for consistency",
    ],
    capabilities: [
      "Recurring lane capacity sourced through Landstar's network",
      "Consistent operating instructions across every load in the program",
      "A single logistics contact managing the lane rather than a rotating dispatch queue",
      "Integration with drop trailer and JIT programs where useful",
      "Performance tracking across the recurring schedule",
    ],
    process: [
      "Review lane volume, frequency, and delivery requirements",
      "Build a standing set of operating instructions for the lane",
      "Source consistent capacity for the schedule",
      "Monitor performance and address issues before they repeat",
      "Adjust the program as volume or requirements change",
    ],
    needToQuote: [
      "Origin and destination(s) and frequency (loads per week)",
      "Typical commodity, weight, and equipment type",
      "Delivery requirements (appointments, unloading expectations, multiple stops)",
      "Desired program length or commitment",
      "Any existing pain points with the current capacity arrangement",
    ],
    considerations: [
      "Dedicated capacity is built around demonstrated or projected volume and is scoped before a program is proposed.",
      "Recurring programs work best when unloading and delivery requirements are defined up front and stay consistent.",
    ],
    faqs: [
      {
        q: "How much volume is needed to justify a dedicated program?",
        a: "There is no fixed minimum. We look at frequency, consistency, and delivery requirements to determine whether a dedicated or recurring approach makes sense versus load-by-load sourcing.",
      },
      {
        q: "Can dedicated lanes include driver-assisted or drop-trailer requirements?",
        a: "Yes. Recurring programs are a common way to standardize unloading expectations, drop trailer staging, or other specialized requirements across every load in the lane.",
      },
    ],
    related: ["drop-trailer-programs", "just-in-time-transportation", "carpet-padding-flooring"],
  },
  {
    slug: "dry-van-truckload",
    navLabel: "Dry Van Truckload",
    title: "Dry Van Truckload Transportation",
    shortDescription:
      "Standard and specialized dry van truckload capacity for palletized, floor-loaded, and mixed freight nationwide.",
    metaTitle: "Dry Van Truckload Shipping Services | Flux Logistics",
    metaDescription:
      "Flux Logistics sources dry van truckload capacity nationwide, from standard palletized freight to floor-loaded and driver-assisted shipments.",
    priority: "primary",
    keywords: [
      "dry van truckload shipping",
      "full truckload trucking",
      "dry van freight carrier",
      "FTL shipping",
      "nationwide truckload capacity",
    ],
    intro: [
      "Dry van truckload is the foundation of most freight programs, and it still requires the right carrier, the right equipment condition, and clear communication about how the freight will be handled. Flux Logistics sources dry van capacity for both standard dock-to-dock freight and shipments with more specific handling or delivery requirements.",
    ],
    goodFit: [
      "The freight is palletized, floor loaded, or mixed and needs a fully enclosed trailer",
      "The shipment requires a clean, dry trailer free of odor or prior residue",
      "The shipper needs single or multi-stop dry van capacity",
      "The lane is a one-time move or part of a recurring program",
      "The freight may require driver-assisted unloading in addition to standard transport",
    ],
    capabilities: [
      "Nationwide dry van capacity sourced through Landstar's network",
      "Support for both standard and specialized handling requirements within a dry van",
      "Multi-stop and partial truckload routing when needed",
      "Coordination of trailer condition requirements (clean, dry, odor-free) for sensitive commodities",
      "Integration with driver-assist, JIT, and dedicated programs",
    ],
    process: [
      "Confirm commodity, weight, dimensions, and packaging",
      "Identify any handling, cleanliness, or trailer-condition requirements",
      "Source qualified dry van capacity for the lane",
      "Communicate delivery and unloading expectations in the operating instructions",
      "Track the shipment through delivery",
    ],
    needToQuote: [
      "Pickup and delivery locations and dates",
      "Commodity, weight, and packaging (palletized or floor loaded)",
      "Number of pallets, pieces, or units",
      "Any special trailer requirements (clean, dry, food-grade, etc.)",
      "Unloading expectations at delivery",
    ],
    considerations: [
      "Trailer condition requirements should be disclosed up front, particularly for sensitive or odor-sensitive commodities.",
      "Multi-stop routing affects both pricing and transit time and is planned before dispatch.",
    ],
    faqs: [
      {
        q: "Can dry van freight include driver-assisted unloading?",
        a: "Yes. Driver-assisted unloading is arranged separately and must be confirmed with the carrier before booking. See our Driver-Assisted Freight page for details.",
      },
      {
        q: "Do you handle partial and multi-stop truckload freight?",
        a: "Yes, both are available depending on the lane and freight involved. Share the stop count and volume per stop and we will confirm the best routing approach.",
      },
    ],
    related: ["driver-assisted-freight", "expedited-freight", "high-value-freight"],
  },
  {
    slug: "high-value-freight",
    navLabel: "High-Value Freight",
    title: "High-Value & Sensitive Freight",
    shortDescription:
      "Added planning, communication, and carrier vetting for freight where security and handling matter as much as price.",
    metaTitle: "High-Value & Sensitive Freight Shipping | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates high-value and sensitive freight shipments with added carrier vetting, communication, and handling planning.",
    priority: "primary",
    keywords: [
      "high value freight shipping",
      "secure truckload transportation",
      "sensitive cargo trucking",
      "high value cargo carrier",
      "theft-sensitive freight shipping",
    ],
    intro: [
      "High-value freight, electronics, sensitive equipment, or product with meaningful theft or damage risk, calls for more scrutiny than a standard truckload. The right carrier, the right handling instructions, and consistent communication all reduce risk before it becomes a claim.",
      "Flux Logistics applies additional vetting and communication to high-value shipments, from carrier selection through delivery confirmation.",
    ],
    goodFit: [
      "The freight has significant per-load value or is a target for theft",
      "The shipment requires specific handling instructions to avoid damage",
      "The shipper needs added visibility and communication during transit",
      "Insurance or coverage documentation needs to be confirmed before the load moves",
      "The freight should avoid unattended stops or overnight layovers where possible",
    ],
    capabilities: [
      "Carrier vetting focused on experience with high-value or sensitive freight",
      "Coordination of handling instructions to reduce damage risk",
      "Communication planning to reduce unattended stops and improve visibility",
      "Support for confirming cargo insurance coverage on a per-shipment basis",
      "Delivery confirmation and documentation at destination",
    ],
    process: [
      "Review the commodity's value, sensitivity, and handling requirements",
      "Select a carrier suited to the risk profile of the shipment",
      "Confirm handling instructions and communication expectations",
      "Monitor the shipment through transit",
      "Confirm delivery and documentation at destination",
    ],
    needToQuote: [
      "Commodity description and approximate declared value",
      "Packaging and handling requirements",
      "Pickup and delivery locations and dates",
      "Any insurance or documentation requirements specific to the shipment",
      "Security or communication expectations during transit",
    ],
    considerations: [
      "Cargo insurance coverage and limits should be confirmed for the specific shipment before it moves; coverage is not assumed.",
      "Added security and communication measures may affect available capacity and pricing.",
    ],
    faqs: [
      {
        q: "Do you provide cargo insurance?",
        a: "Cargo insurance coverage is confirmed on a per-shipment basis with the carrier. Share the commodity value and any specific coverage requirements and we will confirm what applies before booking.",
      },
      {
        q: "Can you avoid overnight stops for high-value freight?",
        a: "Team-driver service or planned routing can reduce unattended stops when arranged in advance. This is confirmed as part of the quote, not assumed by default.",
      },
    ],
    related: ["expedited-freight", "dry-van-truckload", "hazmat-freight"],
  },
  {
    slug: "cross-border-mexico-freight",
    navLabel: "Cross-Border & Mexico",
    title: "Cross-Border & Mexico Transportation",
    shortDescription:
      "Coordinated cross-border truckload capacity between the United States and Mexico, including documentation and transfer planning.",
    metaTitle: "Cross-Border & Mexico Freight Transportation | Flux Logistics",
    metaDescription:
      "Flux Logistics coordinates cross-border truckload transportation between the United States and Mexico, including documentation, transfer, and carrier coordination.",
    priority: "primary",
    keywords: [
      "cross border trucking",
      "Mexico freight shipping",
      "US Mexico truckload",
      "cross border logistics",
      "nearshoring freight transportation",
    ],
    intro: [
      "Cross-border freight between the United States and Mexico involves documentation, customs coordination, and often a transfer between carriers at the border. Missing a document or misjudging transfer timing turns a routine shipment into a delayed one.",
      "Flux Logistics coordinates cross-border truckload moves, working with carriers experienced in border crossings and confirming documentation requirements before the shipment departs.",
    ],
    goodFit: [
      "The shipment crosses between the United States and Mexico in either direction",
      "The freight requires coordination between a U.S. carrier and a cross-border or Mexican carrier",
      "Customs documentation needs to be confirmed before the shipment departs",
      "The shipper needs visibility into border transfer timing",
      "The lane supports nearshoring or recurring cross-border distribution",
    ],
    capabilities: [
      "Coordination of cross-border truckload capacity in both directions",
      "Communication with carriers experienced in border-crossing logistics",
      "Confirmation of required documentation ahead of departure",
      "Awareness of typical border transfer and wait-time patterns",
      "Support for recurring cross-border lanes",
    ],
    process: [
      "Confirm origin, destination, and border crossing point",
      "Verify documentation requirements for the specific commodity and crossing",
      "Source capacity on both sides of the border as needed",
      "Coordinate the border transfer and communicate status to the shipper",
      "Confirm final delivery",
    ],
    needToQuote: [
      "Pickup location in the U.S. or Mexico and delivery location on the other side",
      "Preferred or required border crossing point, if known",
      "Commodity, weight, and packaging",
      "Customs broker information, if the shipper has one in place",
      "Target pickup and delivery dates",
    ],
    considerations: [
      "Cross-border transit times depend on border wait times and documentation readiness and are not guaranteed without confirmation.",
      "Customs clearance is the shipper's responsibility unless a broker relationship is confirmed as part of the shipment plan.",
    ],
    faqs: [
      {
        q: "Do you handle customs clearance?",
        a: "Customs clearance is typically handled by the shipper's customs broker. We coordinate the transportation and transfer logistics around the broker's documentation and timing.",
      },
      {
        q: "Which border crossings do you support?",
        a: "Coordination is available across major U.S.–Mexico crossings depending on the lane. Share your typical crossing point and we will confirm current capacity.",
      },
    ],
    related: ["dedicated-transportation", "project-freight", "dry-van-truckload"],
  },
  {
    slug: "project-freight",
    navLabel: "Project Freight",
    title: "Project Freight & Multi-Stop Shipments",
    shortDescription:
      "Coordinated planning for complex shipments with multiple stops, mixed equipment needs, or phased delivery schedules.",
    metaTitle: "Project Freight & Multi-Stop Truckload Coordination | Flux Logistics",
    metaDescription:
      "Flux Logistics plans and coordinates project freight and multi-stop shipments involving mixed equipment, phased delivery, and multiple job sites.",
    priority: "primary",
    keywords: [
      "project freight logistics",
      "multi stop truckload",
      "project cargo shipping",
      "construction freight logistics",
      "phased delivery trucking",
    ],
    intro: [
      "Some shipments are not a single load, they're a project: multiple stops, multiple pieces of equipment, phased delivery to a job site, or a combination of freight types moving on a coordinated schedule. This requires planning across the whole project, not just one truckload at a time.",
      "Flux Logistics plans project freight around the full scope of the job, coordinating equipment types, delivery sequencing, and communication across every stop.",
    ],
    goodFit: [
      "The shipment includes multiple stops or delivery phases",
      "Different pieces of freight require different equipment types (dry van, flatbed, oversized)",
      "Delivery needs to be sequenced around a job site or construction schedule",
      "Multiple stakeholders (shipper, receiver, job site contact) need coordinated communication",
      "The project spans more than a single truckload",
    ],
    capabilities: [
      "Coordination across mixed equipment types within a single project",
      "Multi-stop and phased delivery scheduling",
      "Communication across shipper, receiver, and job-site contacts",
      "Sequencing support for construction and installation timelines",
      "Integration with oversized, heavy haul, or driver-assisted requirements when part of the project",
    ],
    process: [
      "Review the full scope of the project, including all freight types and stops",
      "Build a delivery sequence aligned to the job-site or project schedule",
      "Source the equipment types needed across the project",
      "Communicate stop-specific requirements to each carrier and driver",
      "Track the project through completion and confirm each delivery",
    ],
    needToQuote: [
      "Full list of stops, including addresses and sequencing requirements",
      "Freight types and equipment needed at each stop",
      "Weight, dimensions, and handling requirements per stop",
      "Target delivery dates or phases",
      "Job-site or receiving contact information for each stop",
    ],
    considerations: [
      "Project freight pricing is built around the full scope and sequencing of the job, not a single load rate.",
      "Multi-stop and phased projects benefit from early planning; late-stage changes can affect sequencing and cost.",
    ],
    faqs: [
      {
        q: "Can you coordinate deliveries to a construction job site?",
        a: "Yes. Job-site delivery coordination is a common part of project freight, including sequencing around site access and construction schedules.",
      },
      {
        q: "How far in advance should a project freight plan be started?",
        a: "As early as possible, particularly if the project involves oversized freight, multiple equipment types, or a tight construction schedule.",
      },
    ],
    related: ["oversized-freight", "heavy-haul", "dedicated-transportation"],
  },
];

export type SecondaryService = {
  name: string;
  description: string;
};

export const secondaryServices: SecondaryService[] = [
  {
    name: "Team-Driver Transportation",
    description: "Continuous-movement capacity for long-haul, time-critical lanes that can't stop for mandatory rest.",
  },
  {
    name: "Emergency Freight",
    description: "Rapid-response sourcing for unplanned shipments tied to breakdowns, shortages, or production stoppages.",
  },
  {
    name: "Liftgate Service",
    description: "Liftgate-equipped trailers for locations without dock access, arranged and confirmed before dispatch.",
  },
  {
    name: "Job-Site Delivery",
    description: "Coordination for deliveries to active construction or job sites with limited or non-standard access.",
  },
  {
    name: "Retail Delivery",
    description: "Delivery coordination for retail locations with appointment, dock, and receiving requirements.",
  },
  {
    name: "Port & Airport Freight",
    description: "Drayage-adjacent truckload moves connecting port and airport freight to inland destinations.",
  },
  {
    name: "Temperature-Controlled Freight",
    description: "Reefer capacity sourced when a shipment requires temperature control in addition to standard handling.",
  },
  {
    name: "Partial Truckload",
    description: "Capacity for shipments that don't require a full trailer, consolidated with compatible freight.",
  },
  {
    name: "Multi-Stop Truckload",
    description: "Single-trailer routing across multiple pickup or delivery points on one coordinated schedule.",
  },
  {
    name: "Drop-and-Hook Programs",
    description: "Trailer-swap operations that keep freight moving without waiting on a live load or unload.",
  },
  {
    name: "Lumper-Service Coordination",
    description: "Arranging third-party unloading labor when a facility requires it instead of driver involvement.",
  },
  {
    name: "Customer-Unload Shipments",
    description: "Standard dock-to-dock freight where the receiver provides its own labor and equipment.",
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

export const primaryServices = services.filter((s) => s.priority === "primary");
export const templatedServices = services.filter((s) => s.priority === "primary" && !s.customPage);
