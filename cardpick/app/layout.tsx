import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ScanProvider } from "@/lib/scan-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CardPick",
  description: "Inventory, pricing, and order-picking for a TCG card shop",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/locations", label: "Locations" },
  { href: "/orders", label: "Orders" },
  { href: "/pick", label: "Pick List" },
  { href: "/reconcile", label: "Reconcile" },
  { href: "/pricing", label: "Pricing" },
  { href: "/labels", label: "QR Labels" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex bg-neutral-50 text-neutral-900">
        <ScanProvider>
          <nav className="w-48 shrink-0 border-r border-neutral-200 bg-white p-4">
            <div className="mb-6 text-lg font-bold tracking-tight">CardPick</div>
            <ul className="space-y-1 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded px-2 py-1.5 hover:bg-neutral-100">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <main className="flex-1 min-w-0 p-6">{children}</main>
        </ScanProvider>
      </body>
    </html>
  );
}
