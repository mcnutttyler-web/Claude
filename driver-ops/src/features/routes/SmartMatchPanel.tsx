import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import type { Route, Driver, SmartMatchResult } from '@/types'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { VEHICLE_LABELS, pct, formatCurrency, STAGE_COLORS, STAGE_LABELS } from '@/lib/utils'
import { X, Zap, CheckCircle, AlertTriangle, Star } from 'lucide-react'

function scoreDriver(route: Route, driver: Driver, marketMatch: boolean): SmartMatchResult {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 0

  // Market match
  if (marketMatch) { score += 25; reasons.push('Same market') }

  // Vehicle match
  if (driver.vehicleClass === route.vehicleClass) { score += 20; reasons.push('Vehicle class matches') }
  else warnings.push(`Vehicle mismatch (driver: ${VEHICLE_LABELS[driver.vehicleClass]}, route: ${VEHICLE_LABELS[route.vehicleClass]})`)

  // Availability (day of week)
  const dayMap: Record<string, string> = { '0': 'sun', '1': 'mon', '2': 'tue', '3': 'wed', '4': 'thu', '5': 'fri', '6': 'sat' }
  const routeDay = dayMap[new Date(route.date).getDay().toString()]
  if (driver.preferences.days.includes(routeDay as never)) { score += 15; reasons.push('Available on this day') }
  else warnings.push('Day not in preferences')

  // Stop count preference
  const { stopMin, stopMax } = driver.preferences
  if (route.stops >= stopMin && route.stops <= stopMax) { score += 10; reasons.push('Stop count in range') }
  else if (route.stops < stopMin) warnings.push(`Below preferred stops (${stopMin})`)
  else warnings.push(`Above preferred stops (${stopMax})`)

  // Pay preference
  if (route.pay >= driver.preferences.payMin) { score += 10; reasons.push('Pay meets minimum') }
  else warnings.push(`Pay below minimum (${formatCurrency(driver.preferences.payMin)})`)

  // Miles preference
  if (route.miles <= driver.preferences.milesMax) { score += 5; reasons.push('Miles in range') }
  else warnings.push(`Exceeds preferred miles (${driver.preferences.milesMax})`)

  // Reliability score (up to 10 pts)
  const relScore = Math.floor(driver.reliabilityScore / 10)
  score += relScore
  if (driver.reliabilityScore >= 80) reasons.push(`High reliability (${driver.reliabilityScore}/100)`)

  // Acceptance rate (up to 5 pts)
  score += Math.floor(driver.acceptanceRate * 5)
  if (driver.acceptanceRate >= 0.9) reasons.push(`High acceptance rate (${pct(driver.acceptanceRate)})`)

  // Insurance check
  if (driver.insuranceExpiry) {
    const daysLeft = (new Date(driver.insuranceExpiry).getTime() - Date.now()) / 86400000
    if (daysLeft < 0) { score -= 40; warnings.push('Insurance EXPIRED') }
    else if (daysLeft < 14) { score -= 10; warnings.push(`Insurance expiring in ${Math.floor(daysLeft)} days`) }
  } else {
    warnings.push('No insurance on file')
    score -= 20
  }

  // Status bonus
  if (driver.status === 'active') score += 5
  if (driver.pipelineStage === 'ready' || driver.pipelineStage === 'active') { score += 5; reasons.push('Ready to work') }

  // Cap score
  score = Math.min(100, Math.max(0, score))

  return { driver, score, reasons, warnings }
}

interface Props {
  route: Route
  onClose: () => void
}

export function SmartMatchPanel({ route, onClose }: Props) {
  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const assignments = useLiveQuery(() => db.assignments.where('routeId').equals(route.id).toArray(), [route.id])

  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))
  const assignedDriverIds = new Set((assignments ?? []).map(a => a.driverId))

  const matches = useMemo(() => {
    if (!drivers) return []
    return drivers
      .filter(d => d.status !== 'do_not_call' && d.status !== 'suspended')
      .map(d => scoreDriver(route, d, d.marketId === route.marketId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
  }, [drivers, route])

  async function assign(driverId: string) {
    await db.assignments.add({
      id: `a_${Date.now()}`,
      routeId: route.id,
      driverId,
      type: 'primary',
      status: 'committed',
      assignedAt: new Date().toISOString(),
      assignedBy: 'u1',
    })
    await db.routes.update(route.id, { status: 'committed', updatedAt: new Date().toISOString() })
  }

  return (
    <aside className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-blue-400" />
            <span className="text-sm font-semibold text-slate-100">Smart Match</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {marketMap[route.marketId]} · {route.date} · {route.stops} stops · {formatCurrency(route.pay)}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {matches.map(({ driver, score, reasons, warnings }) => {
          const fullName = `${driver.firstName} ${driver.lastName}`
          const isAssigned = assignedDriverIds.has(driver.id)
          return (
            <div key={driver.id} className="border-b border-slate-800/60 p-3">
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={fullName} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-100">{fullName}</span>
                    {isAssigned && <Badge className="bg-green-900 text-green-200 text-[10px]">Assigned</Badge>}
                  </div>
                  <div className="text-[10px] text-slate-400">{marketMap[driver.marketId]} · {VEHICLE_LABELS[driver.vehicleClass]}</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className={`text-sm font-bold tabular-nums ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {score}
                  </div>
                  <div className="text-[10px] text-slate-500">score</div>
                </div>
              </div>

              {/* Score bar */}
              <div className="w-full h-1 bg-slate-700 rounded-full mb-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${score}%`,
                    background: score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
                  }}
                />
              </div>

              {/* Reasons */}
              <div className="space-y-0.5 mb-2">
                {reasons.slice(0, 3).map(r => (
                  <div key={r} className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle size={9} /> {r}
                  </div>
                ))}
                {warnings.slice(0, 2).map(w => (
                  <div key={w} className="flex items-center gap-1 text-[10px] text-yellow-400">
                    <AlertTriangle size={9} /> {w}
                  </div>
                ))}
              </div>

              {!isAssigned && (
                <Button size="sm" variant="primary" className="w-full" onClick={() => assign(driver.id)}>
                  Assign Driver
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
