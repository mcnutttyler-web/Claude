import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

interface StatProps {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'default' | 'green' | 'red' | 'yellow' | 'blue'
}

const ICON_COLORS = {
  default: 'text-slate-400 bg-slate-700',
  green: 'text-emerald-400 bg-emerald-900/50',
  red: 'text-red-400 bg-red-900/50',
  yellow: 'text-yellow-400 bg-yellow-900/50',
  blue: 'text-blue-400 bg-blue-900/50',
}

export function Stat({ label, value, sub, icon: Icon, trend, trendValue, color = 'default' }: StatProps) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        {Icon && (
          <span className={cn('p-1.5 rounded-lg', ICON_COLORS[color])}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-100 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
      {trendValue && (
        <div className={cn('text-xs font-medium', trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400')}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
        </div>
      )}
    </div>
  )
}
