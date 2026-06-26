import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { useUIStore } from '@/stores/ui'
import type { Driver, PipelineStage, VehicleClass } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { SearchInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import {
  STAGE_COLORS, STAGE_LABELS, STATUS_COLORS, VEHICLE_LABELS,
  pct, formatRelative, formatDate,
} from '@/lib/utils'
import { Phone, Mail, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortField = keyof Driver | 'name'
type SortDir = 'asc' | 'desc'

const STAGES = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }))
const VEHICLES = Object.entries(VEHICLE_LABELS).map(([value, label]) => ({ value, label }))
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'do_not_call', label: 'Do Not Call' },
]

export function DriverTable() {
  const { setSelectedDriver, selectedDriverId } = useUIStore()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'name', dir: 'asc' })
  const [showFilters, setShowFilters] = useState(false)

  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const drivers = useLiveQuery(() => db.drivers.toArray(), [])

  const marketOptions = (markets ?? []).map(m => ({ value: m.id, label: m.name }))
  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))

  const filtered = useMemo(() => {
    let list = drivers ?? []
    const q = search.toLowerCase()
    if (q) {
      list = list.filter(d =>
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.phone.includes(q) ||
        marketMap[d.marketId]?.toLowerCase().includes(q)
      )
    }
    if (stageFilter) list = list.filter(d => d.pipelineStage === stageFilter)
    if (statusFilter) list = list.filter(d => d.status === statusFilter)
    if (vehicleFilter) list = list.filter(d => d.vehicleClass === vehicleFilter)
    if (marketFilter) list = list.filter(d => d.marketId === marketFilter)
    return [...list].sort((a, b) => {
      let av: string | number = '', bv: string | number = ''
      if (sort.field === 'name') { av = `${a.firstName} ${a.lastName}`; bv = `${b.firstName} ${b.lastName}` }
      else av = (a as Record<string, unknown>)[sort.field] as string ?? '', bv = (b as Record<string, unknown>)[sort.field] as string ?? ''
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
  }, [drivers, search, stageFilter, statusFilter, vehicleFilter, marketFilter, sort, marketMap])

  const activeFilters = [stageFilter, statusFilter, vehicleFilter, marketFilter].filter(Boolean).length

  function SortIcon({ field }: { field: SortField }) {
    if (sort.field !== field) return <ChevronsUpDown size={12} className="text-slate-500" />
    return sort.dir === 'asc' ? <ChevronUp size={12} className="text-blue-400" /> : <ChevronDown size={12} className="text-blue-400" />
  }

  function toggleSort(field: SortField) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  function Th({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <th
        className="text-left px-3 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
      >
        <span className="flex items-center gap-1">{children}<SortIcon field={field} /></span>
      </th>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <SearchInput
          placeholder="Search drivers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64"
        />
        <Button
          variant={showFilters || activeFilters > 0 ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={13} />
          Filters
          {activeFilters > 0 && (
            <span className="bg-blue-500 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">{activeFilters}</span>
          )}
        </Button>
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setStageFilter(''); setStatusFilter(''); setVehicleFilter(''); setMarketFilter('') }}>
            <X size={13} /> Clear
          </Button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{filtered.length} drivers</span>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 flex-wrap">
          <Select options={STAGES} placeholder="All stages" value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="w-40" />
          <Select options={STATUSES} placeholder="All statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36" />
          <Select options={VEHICLES} placeholder="All vehicles" value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} className="w-36" />
          <Select options={marketOptions} placeholder="All markets" value={marketFilter} onChange={e => setMarketFilter(e.target.value)} className="w-36" />
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 border-b border-slate-700">
            <tr>
              <Th field="name">Driver</Th>
              <Th field="pipelineStage">Stage</Th>
              <Th field="status">Status</Th>
              <Th field="marketId">Market</Th>
              <Th field="vehicleClass">Vehicle</Th>
              <Th field="reliabilityScore">Score</Th>
              <Th field="acceptanceRate">Accept</Th>
              <Th field="lastContactAt">Last Contact</Th>
              <Th field="nextFollowupAt">Follow-up</Th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(driver => {
              const isSelected = selectedDriverId === driver.id
              const fullName = `${driver.firstName} ${driver.lastName}`
              return (
                <tr
                  key={driver.id}
                  className={cn(
                    'border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors',
                    isSelected && 'bg-blue-950/30 hover:bg-blue-950/40'
                  )}
                  onClick={() => setSelectedDriver(isSelected ? null : driver.id)}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName} size="sm" />
                      <div>
                        <div className="text-sm font-medium text-slate-100">{fullName}</div>
                        <div className="text-[11px] text-slate-400">{driver.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={STAGE_COLORS[driver.pipelineStage]}>{STAGE_LABELS[driver.pipelineStage]}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={STATUS_COLORS[driver.status]}>{driver.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">{marketMap[driver.marketId] ?? '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">{VEHICLE_LABELS[driver.vehicleClass]}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${driver.reliabilityScore}%`,
                            background: driver.reliabilityScore >= 80 ? '#22c55e' : driver.reliabilityScore >= 60 ? '#f59e0b' : '#ef4444'
                          }}
                        />
                      </div>
                      <span className="text-xs text-slate-300">{driver.reliabilityScore}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-300">{pct(driver.acceptanceRate)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{formatRelative(driver.lastContactAt)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {driver.nextFollowupAt ? (
                      <span className={new Date(driver.nextFollowupAt) < new Date() ? 'text-red-400' : 'text-slate-300'}>
                        {formatDate(driver.nextFollowupAt)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <a href={`tel:${driver.phone}`} className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors">
                        <Phone size={12} />
                      </a>
                      <a href={`mailto:${driver.email}`} className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors">
                        <Mail size={12} />
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No drivers match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}

// keep lucide import referenced
function Users({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
