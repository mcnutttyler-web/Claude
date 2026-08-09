import Link from "next/link";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/import", label: "Import" },
  { href: "/export", label: "Export" },
  { href: "/locations", label: "Locations" },
  { href: "/bulk-assign", label: "Bulk Assign" },
  { href: "/orders", label: "Orders" },
  { href: "/reconcile", label: "Reconcile" },
  { href: "/pricing", label: "Pricing" },
  { href: "/labels", label: "Labels" },
  { href: "/backup", label: "Backup" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <Link href="/" className="font-bold text-lg tracking-tight">
          CardPick
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
