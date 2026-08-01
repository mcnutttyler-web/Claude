import { ReactNode } from "react";

export const inputClasses =
  "w-full rounded-md border border-brand-200 px-4 py-2.5 text-brand-900 placeholder:text-brand-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function Field({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-brand-800">
        {label}
        {required && <span className="ml-0.5 text-accent-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-brand-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function FieldsetLegend({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-bold text-brand-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-brand-600">{description}</p>}
    </div>
  );
}
