import Link from "next/link";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent-500 text-brand-950 hover:bg-accent-400 focus-visible:outline-accent-600",
  secondary: "bg-brand-900 text-white hover:bg-brand-700 focus-visible:outline-brand-900",
  outline: "border-2 border-white text-white hover:bg-white hover:text-brand-900 focus-visible:outline-white",
  ghost: "text-brand-900 hover:bg-brand-50 focus-visible:outline-brand-900",
};

export function Button({
  href,
  children,
  variant = "primary",
  className = "",
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  ariaLabel?: string;
}) {
  const isExternalTel = href.startsWith("tel:") || href.startsWith("mailto:");
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-6 py-3.5 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const classes = `${base} ${variantClasses[variant]} ${className}`;

  if (isExternalTel) {
    return (
      <a href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
