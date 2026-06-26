import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
          size === 'sm' && 'px-2.5 py-1 text-xs',
          size === 'md' && 'px-3.5 py-1.5 text-sm',
          size === 'lg' && 'px-5 py-2.5 text-base',
          variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
          variant === 'secondary' && 'bg-slate-700 text-slate-100 hover:bg-slate-600 active:bg-slate-500',
          variant === 'ghost' && 'text-slate-300 hover:bg-slate-700 hover:text-white',
          variant === 'outline' && 'border border-slate-600 text-slate-200 hover:bg-slate-700',
          variant === 'danger' && 'bg-red-700 text-white hover:bg-red-600',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
