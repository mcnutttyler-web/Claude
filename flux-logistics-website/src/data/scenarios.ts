export type Scenario = { title: string; description: string };

export const scenarios: Scenario[] = [
  {
    title: "The driver needs to help unload",
    description: "The receiving location needs help getting product off the trailer, and driver assistance can be arranged and confirmed in advance.",
  },
  {
    title: "The receiver doesn't have a full unloading crew",
    description: "Limited dock labor at delivery changes how the load needs to be planned, priced, and staffed.",
  },
  {
    title: "The freight is floor loaded",
    description: "Product loaded directly onto the trailer floor, common in flooring and building materials, takes longer to unload than palletized freight.",
  },
  {
    title: "The shipment contains carpet padding or rolled goods",
    description: "Bulky, high-volume, lower-weight freight needs the right trailer and unloading plan, not just the right truck.",
  },
  {
    title: "The freight must arrive within a precise window",
    description: "Just-in-time and appointment-critical deliveries where early or late both cause problems.",
  },
  {
    title: "The shipment requires special equipment",
    description: "Flatbed, step deck, RGN, or other specialized trailers matched to the load.",
  },
  {
    title: "The load contains hazmat",
    description: "Regulated materials that require a certified carrier, proper placarding, and complete documentation.",
  },
  {
    title: "The dimensions require permits",
    description: "Oversized or over-dimensional freight that needs route planning and state permitting before it moves.",
  },
  {
    title: "You need trailers staged at a facility",
    description: "Drop trailer programs that let loading and unloading happen on your schedule, not a live truck's.",
  },
  {
    title: "The lane runs multiple times per week",
    description: "Recurring freight that benefits from dedicated capacity and consistent operating instructions.",
  },
  {
    title: "The shipment has multiple delivery stops",
    description: "Multi-stop and project freight that needs sequencing across more than one location.",
  },
  {
    title: "The freight can't be treated like a standard truckload",
    description: "If your shipment doesn't fit a simple dock-to-dock description, it's worth a conversation before it's quoted like one.",
  },
];
