import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import {
  ROUTE_STATUS_COLORS, PRIORITY_COLORS, VEHICLE_LABELS, formatCurrency,
} from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Filter, Zap } from 'lucide-react'
import { SmartMatchPanel } from './SmartMatchPanel'

export function RoutesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)

  const routes = useLiveQuery(() => db.routes.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [])
  const drivers = useLiveQuery(() => db.drivers.toArray(), [])

  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))
  const marketOptions = (markets ?? []).map(m => ({ value: m.id, label: m.name }))
  const assignmentsByRoute = Object.fromEntries(
    (assignments ?? []).map(a => [a.routeId, a])
  )
  const driverMap = Object.fromEntries((drivers ?? []).map(d => [d.id, d]))

  const STATUSES = ['open','needs_driver','tentative','committed','assigned','completed','cancelled']
    .map(v => ({ value: v, label: v.replace('_', ' ') }))

  const filtered = useMemo(() => {
    let list = routes ?? []
    if (search) list = list.filter(r =>
      marketMap[r.marketId]?.toLowerCase().includes(search.toLowerCase()) ||
      r.notes?.toLowerCase().includes(search.toLowerCase())
    )
    if (statusFilter) list = list.filter(r => r.status === statusFilter)
    if (marketFilter) list = list.filter(r => r.marketId === marketFilter)
    if (dateFilter) list = list.filter(r => r.date === dateFilter)
    return [...list].sort((a, b) => {
      const p = { critical: 4, high: 3, normal: 2, low: 1 }
      const sd = a.date.localeCompare(b.date)
      if (sd !== 0) return sd
      return p[b.priority] - p[a.priority]
    })
  }, [routes, search, statusFilter, marketFilter, dateFilter, marketMap])

  const selectedRoute = (routes ?? []).find(r => r.id === selectedRouteId)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Routes"
        actions={
          <Button variant="primary" size="sm">
            <Plus size={13} /> Add Route
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 flex-shrink-0 flex-wrap">
        <SearchInput placeholder="Search routes…" value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
        <Select options={STATUSES} placeholder="All statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36" />
        <Select options={marketOptions} placeholder="All markets" value={marketFilter} onChange={e => setMarketFilter(e.target.value)} className="w-36" />
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
        />
        {(statusFilter || marketFilter || dateFilter) && (
          <button onClick={() => { setStatusFilter(''); setMarketFilter(''); setDateFilter('') }}
            className="text-xs text-slate-400 hover:text-slate-200">Clear</button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{filtered.length} routes</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 border-b border-slate-700">
              <tr>
                {['Date','Market','Start','Vehicle','Stops','Miles','Pay','Status','Priority','Driver','Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(route => {
                const asgn = assignmentsByRoute[route.id]
                const driver = asgn ? driverMap[asgn.driverId] : null
                const isSelected = selectedRouteId === route.id
                return (
                  <tr
                    key={route.id}
                    className={cn(
                      'border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors',
                      isSelected && 'bg-blue-950/30'
                    )}
                    onClick={() => setSelectedRouteId(isSelected ? null : route.id)}
                  >
                    <td className="px-3 py-2.5 text-sm text-slate-100 whitespace-nowrap">{route.date}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-300">{marketMap[route.marketId] ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-300">{route.startTime}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{VEHICLE_LABELS[route.vehicleClass]}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-200 tabular-nums">{route.stops}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-200 tabular-nums">{route.miles}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-200 tabular-nums">{formatCurrency(route.pay)}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={ROUTE_STATUS_COLORS[route.status]}>{route.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs font-medium', PRIORITY_COLORS[route.priority])}>{route.priority}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {driver ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={`${driver.firstName} ${driver.lastName}`} size="sm" />
                          <span className="text-xs text-slate-300">{driver.firstName} {driver.lastName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-400 hover:text-blue-300"
                        onClick={() => setSelectedRouteId(route.id)}
                      >
                        <Zap size={11} /> Match
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <p className="text-sm">No routes match your filters</p>
            </div>
          )}
        </div>

        {/* Smart match panel */}
        {selectedRoute && (
          <SmartMatchPanel route={selectedRoute} onClose={() => setSelectedRouteId(null)} />
        )}
      </div>
    </div>
  )
}
