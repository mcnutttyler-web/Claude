import { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

type Tone = "white" | "muted" | "navy";

const toneClasses: Record<Tone, string> = {
  white: "bg-white",
  muted: "bg-brand-50",
  navy: "bg-brand-900 text-white",
};

export function Section({
  children,
  className = "",
  tone = "white",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  id?: string;
}) {
  return (
    <section id={id} className={`${toneClasses[tone]} py-16 sm:py-20 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`mb-3 text-sm font-semibold tracking-wide uppercase ${
        dark ? "text-accent-400" : "text-accent-600"
      }`}
    >
      {children}
    </p>
  );
}
