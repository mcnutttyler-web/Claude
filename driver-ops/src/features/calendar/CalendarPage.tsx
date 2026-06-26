import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ROUTE_STATUS_COLORS, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, addDays, format, addWeeks, subWeeks, isSameDay } from 'date-fns'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekDayStrings = weekDays.map(d => format(d, 'yyyy-MM-dd'))

  const routes = useLiveQuery(() => db.routes.toArray(), [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [])
  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])

  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))
  const driverMap = Object.fromEntries((drivers ?? []).map(d => [d.id, d]))
  const assignmentsByRoute = Object.fromEntries((assignments ?? []).map(a => [a.routeId, a]))

  const weekRoutes = (routes ?? []).filter(r => weekDayStrings.includes(r.date))

  const byDay = (dateStr: string) => weekRoutes.filter(r => r.date === dateStr)

  const today = format(new Date(), 'yyyy-MM-dd')

  // Coverage stats per day
  const dayCoverage = weekDayStrings.map(d => {
    const dayRoutes = byDay(d)
    const covered = dayRoutes.filter(r => ['committed','assigned','completed'].includes(r.status)).length
    return { date: d, total: dayRoutes.length, covered }
  })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Commitment Calendar"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-xs text-slate-300 font-medium">
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>
              Today
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-2 mb-3">
          {weekDays.map((day, i) => {
            const dateStr = weekDayStrings[i]
            const cov = dayCoverage[i]
            const isToday = dateStr === today
            return (
              <div key={dateStr} className={cn(
                'rounded-lg border px-3 py-2 text-center',
                isToday ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-800/40'
              )}>
                <div className={cn('text-xs font-semibold', isToday ? 'text-blue-400' : 'text-slate-300')}>
                  {DAYS[i]}
                </div>
                <div className={cn('text-base font-bold', isToday ? 'text-blue-300' : 'text-slate-100')}>
                  {format(day, 'd')}
                </div>
                {cov.total > 0 && (
                  <div className="mt-1">
                    <div className="text-[10px] text-slate-400">{cov.covered}/{cov.total}</div>
                    <div className="w-full h-1 bg-slate-700 rounded-full mt-0.5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(cov.covered / cov.total) * 100}%`,
                          background: cov.covered === cov.total ? '#22c55e' : cov.covered > 0 ? '#f59e0b' : '#ef4444'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Route cards per day */}
        <div className="grid grid-cols-7 gap-2">
          {weekDayStrings.map((dateStr, di) => {
            const dayRoutes = byDay(dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime))
            return (
              <div key={dateStr} className="space-y-1.5 min-h-40">
                {dayRoutes.map(route => {
                  const asgn = assignmentsByRoute[route.id]
                  const driver = asgn ? driverMap[asgn.driverId] : null
                  return (
                    <div
                      key={route.id}
                      className={cn(
                        'rounded-lg border p-2 text-left',
                        route.status === 'completed' ? 'border-emerald-800 bg-emerald-950/30' :
                        route.status === 'assigned' || route.status === 'committed' ? 'border-green-800 bg-green-950/30' :
                        route.status === 'tentative' ? 'border-yellow-800 bg-yellow-950/30' :
                        route.priority === 'critical' ? 'border-red-700 bg-red-950/30' :
                        'border-slate-700 bg-slate-800/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-[10px] font-semibold text-slate-200">{marketMap[route.marketId]}</span>
                        <Badge className={`${ROUTE_STATUS_COLORS[route.status]} text-[9px] px-1`}>
                          {route.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-slate-400">{route.startTime} · {route.stops} stops</div>
                      <div className="text-[10px] text-slate-400">{formatCurrency(route.pay)}</div>
                      {driver ? (
                        <div className="mt-1 text-[10px] font-medium text-emerald-400 truncate">
                          ✓ {driver.firstName} {driver.lastName}
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] text-red-400">Unassigned</div>
                      )}
                    </div>
                  )
                })}
                {dayRoutes.length === 0 && (
                  <div className="text-[10px] text-slate-600 text-center pt-4">—</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
