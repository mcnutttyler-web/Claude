export type UnloadTerm = {
  term: string;
  short: string;
  description: string;
};

// Canonical definitions. Reused on the homepage, the Driver-Assisted Freight
// page, the Carpet Padding page, the FAQ, and the quote form so the site
// never uses these four terms interchangeably.
export const unloadTerms: UnloadTerm[] = [
  {
    term: "Driver Assist",
    short: "The driver physically helps load or unload the freight.",
    description:
      "The driver provides hands-on help moving product off the trailer alongside receiving personnel, but is not solely responsible for the full unload. Driver assist must be disclosed before booking, confirmed with the carrier, and reflected in the rate.",
  },
  {
    term: "Driver Unload",
    short: "The driver is responsible for unloading some or all of the shipment.",
    description:
      "The driver is expected to unload some or all of the freight without meaningful help from the receiver. This is a larger labor commitment than driver assist and requires a carrier willing and approved to accept that responsibility, along with a rate that reflects the added time and labor.",
  },
  {
    term: "Lumper Service",
    short: "A third-party unloading service is hired to unload the trailer.",
    description:
      "A third-party labor crew, arranged and paid for as part of the shipment, unloads the trailer at the delivery location. Lumper service is common at high-volume distribution centers and facilities that require dedicated dock labor rather than driver involvement.",
  },
  {
    term: "Customer Unload",
    short: "The receiver provides the people and equipment needed to unload the shipment.",
    description:
      "The receiving location supplies its own labor and equipment to unload the trailer. This is the standard dock-to-dock arrangement and requires no additional coordination with the driver.",
  },
];
