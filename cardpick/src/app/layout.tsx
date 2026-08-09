import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ScanListener from "@/components/ScanListener";

export const metadata: Metadata = {
  title: "CardPick",
  description: "Card inventory, pricing, and pick-and-pack for TCGplayer sellers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <ScanListener />
        <Nav />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
