export function Badge({ value, className }: { value: string; className?: string }) {
  return <span className={`badge ${className ?? value}`}>{value.replace(/_/g, ' ')}</span>;
}
