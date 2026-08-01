export const site = {
  name: "Flux Logistics",
  legalName: "Flux Logistics",
  tagline: "Specialized freight support for shipments that require more than dock-to-dock transportation.",
  supportingStatement:
    "Flux Logistics coordinates nationwide capacity for driver-assisted deliveries, carpet and flooring products, hazmat freight, oversized loads, expedited shipments, drop trailer programs and other freight requiring hands-on planning and execution.",
  owner: "Tyler McNutt",
  ownerTitle: "Owner & Logistics Agent",
  phone: "937-661-2340",
  phoneHref: "tel:19376612340",
  email: "tyler@fluxlogistics.co",
  emailHref: "mailto:tyler@fluxlogistics.co",
  serviceArea: "United States",
  agencyOf: "Landstar",
  agencyOfUrl: "https://www.landstar.com",
  url: "https://www.fluxlogistics.co",
  addressRegion: "US",
  social: {
    // Reserved for future profiles. Leave empty until accounts exist — do not
    // publish placeholder social links.
  },
} as const;

export const primaryNav = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Industries", href: "/industries" },
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
] as const;

export const footerNav = {
  company: [
    { label: "About Flux Logistics", href: "/about" },
    { label: "Industries", href: "/industries" },
    { label: "Resources", href: "/resources" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms and Conditions", href: "/terms-and-conditions" },
  ],
} as const;
