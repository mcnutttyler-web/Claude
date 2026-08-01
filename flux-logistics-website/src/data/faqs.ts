export type Faq = { q: string; a: string; category: "driver-assist" | "flooring" | "quote" | "general" };

export const faqs: Faq[] = [
  {
    category: "driver-assist",
    q: "Can the driver help unload my freight?",
    a: "Sometimes, but it is never assumed. Driver-assisted unloading must be disclosed before the shipment is booked, confirmed with the carrier and driver, and reflected in the rate. We do not quote or dispatch a load assuming the driver will unload unless that has been explicitly arranged.",
  },
  {
    category: "driver-assist",
    q: "What is a driver-assist charge?",
    a: "It's an additional charge that reflects the driver's time and labor when they are asked to help load or unload freight beyond a standard dock-to-dock delivery. The charge depends on the amount of labor involved, and it is confirmed with the carrier before the shipment is dispatched, not added after the fact.",
  },
  {
    category: "driver-assist",
    q: "What is the difference between driver assist and a lumper?",
    a: "Driver assist means the truck driver personally helps load or unload the freight. A lumper is a separate, third-party worker hired specifically to unload the trailer, so the driver is not doing the physical labor. Both are different from driver unload (the driver does the full unload) and customer unload (the receiver handles it entirely).",
  },
  {
    category: "flooring",
    q: "Can you transport carpet padding?",
    a: "Yes. Carpet padding, carpet rolls, underlayment, and similar rolled or bulky flooring products are one of our core areas of experience, including shipments that are floor loaded or require driver-assisted unloading at delivery.",
  },
  {
    category: "flooring",
    q: "Can you handle floor-loaded freight?",
    a: "Yes. Floor-loaded freight (product loaded directly onto the trailer floor rather than palletized) is common in flooring and building-material shipments. We confirm the loading method and expected unloading time before sourcing the truck.",
  },
  {
    category: "driver-assist",
    q: "What information is needed for a driver-unload quote?",
    a: "We need to know what the driver would be expected to physically do, roughly how many pieces or units are involved, whether the facility will provide any assistance, what equipment (like a pallet jack) is available, and whether the delivery is to a dock, curb, or job site. Our quote form walks through these questions when driver assistance is selected.",
  },
  {
    category: "general",
    q: "Can you arrange delivery to a job site?",
    a: "Yes, job-site delivery coordination is a regular part of what we handle, particularly for construction materials and flooring products. Site access, unloading conditions, and appointment requirements are confirmed in advance.",
  },
  {
    category: "driver-assist",
    q: "Can the driver operate a forklift?",
    a: "Not unless it has been specifically authorized, and the driver is qualified and approved to operate that equipment. We never assume a driver can or will operate powered equipment such as a forklift. If forklift operation is needed, it has to be confirmed as part of the arrangement, or the receiving facility needs to provide forklift support.",
  },
  {
    category: "driver-assist",
    q: "Is driver-assisted unloading included in the freight rate?",
    a: "No, not automatically. Unloading labor beyond a standard dock-to-dock delivery is a separate consideration that affects carrier selection and pricing. It must be disclosed and confirmed before the rate is finalized.",
  },
  {
    category: "flooring",
    q: "Can you support recurring flooring deliveries?",
    a: "Yes. Recurring flooring and building-material distribution lanes are a strong fit for dedicated capacity or drop trailer programs, which help keep delivery expectations and unloading arrangements consistent across every load.",
  },
  {
    category: "general",
    q: "Can you provide drop trailers?",
    a: "Yes, drop trailer programs are available and are typically sized around a facility's actual loading and unloading volume. See our Drop Trailer Programs page for details.",
  },
  {
    category: "general",
    q: "Can you handle multiple delivery stops?",
    a: "Yes. Multi-stop truckload and project freight routing is available and is planned in advance around each stop's specific requirements.",
  },
  {
    category: "quote",
    q: "How fast can I get a freight quote?",
    a: "It depends on how complete the shipment details are. A straightforward dock-to-dock load can often be quoted quickly; freight with driver-assisted, hazmat, or oversized requirements takes a bit more review to confirm handling, equipment, and carrier fit before we quote it accurately.",
  },
  {
    category: "quote",
    q: "Does submitting the quote form guarantee a rate or truck?",
    a: "No. Submitting the form starts a review of your shipment. Rates and capacity are confirmed after we review the complete handling, equipment, and delivery requirements, and driver-assisted services specifically must be confirmed with the carrier before dispatch.",
  },
  {
    category: "general",
    q: "Do you only work with large shippers?",
    a: "No. We work with shippers of all sizes, from one-time specialized shipments to recurring, dedicated freight programs. What matters more than size is whether the freight needs the kind of hands-on planning we focus on.",
  },
  {
    category: "general",
    q: "What areas do you serve?",
    a: "We coordinate truckload transportation across the United States, along with cross-border moves between the United States and Mexico.",
  },
  {
    category: "general",
    q: "Are you a Landstar agency or a broker?",
    a: "Flux Logistics is an independent agency of Landstar, one of the largest transportation networks in North America. That gives us access to a large, vetted carrier base while keeping your point of contact small: you work directly with our team, not a call center.",
  },
  {
    category: "general",
    q: "Can you handle hazmat shipments?",
    a: "Yes, subject to the specific hazard class, packing group, and carrier certification required for that shipment. See our Hazmat Freight page for what we need to quote it correctly.",
  },
  {
    category: "general",
    q: "Do you handle oversized or permitted loads?",
    a: "Yes. Oversized and over-dimensional freight is one of our specialized capabilities, including permit coordination and route planning. See our Oversized Freight page for details.",
  },
  {
    category: "driver-assist",
    q: "What's the difference between driver unload and customer unload?",
    a: "Driver unload means the truck driver is responsible for unloading some or all of the shipment. Customer unload means the receiving location provides its own labor and equipment, and the driver is not involved in unloading at all.",
  },
];

export const homepageFaqSlugs = [
  "Can the driver help unload my freight?",
  "What is a driver-assist charge?",
  "Can you transport carpet padding?",
  "Can you provide drop trailers?",
  "Can you handle multiple delivery stops?",
  "Are you a Landstar agency or a broker?",
];
