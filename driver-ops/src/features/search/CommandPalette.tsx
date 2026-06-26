import { useEffect, useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { useUIStore } from '@/stores/ui'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { STAGE_COLORS, STAGE_LABELS, ROUTE_STATUS_COLORS, VEHICLE_LABELS } from '@/lib/utils'
import { Search, Route, X } from 'lucide-react'

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setSelectedDriver } = useUIStore()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const routes = useLiveQuery(() => db.routes.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
      if (e.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  useEffect(() => {
    if (!commandOpen) setQuery('')
  }, [commandOpen])

  const q = query.toLowerCase()
  const driverResults = useMemo(() => {
    if (!q || !drivers) return []
    return drivers.filter(d =>
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
      d.phone.includes(q) ||
      d.email.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [drivers, q])

  const routeResults = useMemo(() => {
    if (!q || !routes) return []
    return routes.filter(r =>
      marketMap[r.marketId]?.toLowerCase().includes(q) ||
      r.date.includes(q)
    ).slice(0, 4)
  }, [routes, q, marketMap])

  if (!commandOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={() => setCommandOpen(false)}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search drivers, routes, markets…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button onClick={() => setCommandOpen(false)} className="text-slate-500 hover:text-slate-300">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!q && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              Type to search drivers, routes, markets, and more
            </div>
          )}

          {driverResults.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Drivers</div>
              {driverResults.map(driver => {
                const fullName = `${driver.firstName} ${driver.lastName}`
                return (
                  <button
                    key={driver.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                    onClick={() => {
                      setSelectedDriver(driver.id)
                      navigate('/drivers')
                      setCommandOpen(false)
                    }}
                  >
                    <Avatar name={fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-100">{fullName}</div>
                      <div className="text-xs text-slate-400">{driver.phone} · {marketMap[driver.marketId]}</div>
                    </div>
                    <Badge className={STAGE_COLORS[driver.pipelineStage]}>{STAGE_LABELS[driver.pipelineStage]}</Badge>
                  </button>
                )
              })}
            </div>
          )}

          {routeResults.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Routes</div>
              {routeResults.map(route => (
                <button
                  key={route.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                  onClick={() => {
                    navigate('/routes')
                    setCommandOpen(false)
                  }}
                >
                  <div className="size-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Route size={12} className="text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-100">{marketMap[route.marketId]} — {route.date}</div>
                    <div className="text-xs text-slate-400">{route.stops} stops · {VEHICLE_LABELS[route.vehicleClass]} · ${route.pay}</div>
                  </div>
                  <Badge className={ROUTE_STATUS_COLORS[route.status]}>{route.status.replace('_', ' ')}</Badge>
                </button>
              ))}
            </div>
          )}

          {q && driverResults.length === 0 && routeResults.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-700 flex items-center gap-4 text-[10px] text-slate-500">
          <span>↵ open</span>
          <span>esc close</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  )
}
