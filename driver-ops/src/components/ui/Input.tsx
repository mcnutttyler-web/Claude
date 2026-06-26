import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'
import { Search } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative flex items-center">
          <span className="absolute left-2.5 text-slate-400 pointer-events-none">{icon}</span>
          <input
            ref={ref}
            className={cn(
              'w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors',
              className
            )}
            {...props}
          />
        </div>
      )
    }
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input icon={<Search size={14} />} {...props} />
}
