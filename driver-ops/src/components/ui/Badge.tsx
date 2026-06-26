import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  dot?: string
}

export function Badge({ children, className, variant = 'default', dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
      variant === 'outline' && 'border border-current bg-transparent',
      className
    )}>
      {dot && <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
      {children}
    </span>
  )
}
