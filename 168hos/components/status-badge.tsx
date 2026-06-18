import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  value: number | null | undefined
  target: number
  higherIsBetter?: boolean
  suffix?: string
  label?: string
}

export function StatusBadge({ value, target, higherIsBetter = true, suffix = '', label }: StatusBadgeProps) {
  if (value == null) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">N/A</span>

  const ratio = value / target
  const isGood = higherIsBetter ? ratio >= 1 : ratio <= 1
  const isOk = higherIsBetter ? ratio >= 0.8 : ratio <= 1.2

  return (
    <span className={cn(
      'px-2 py-0.5 rounded text-xs font-semibold',
      isGood ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
      isOk ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    )}>
      {value.toFixed(1)}{suffix} {label}
    </span>
  )
}
