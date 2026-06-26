import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { useUIStore } from '@/stores/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  STAGE_COLORS, STAGE_LABELS, STATUS_COLORS, VEHICLE_LABELS,
  pct, formatDate, formatRelative, formatCurrency,
} from '@/lib/utils'
import {
  X, Phone, Mail, MapPin, Car, Calendar, Star, TrendingUp,
  FileText, Clock, ChevronRight, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'calls' | 'routes' | 'notes'

export function DriverPanel() {
  const { selectedDriverId, setSelectedDriver } = useUIStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [callNotes, setCallNotes] = useState('')

  const driver = useLiveQuery(
    () => selectedDriverId ? db.drivers.get(selectedDriverId) : Promise.resolve(undefined),
    [selectedDriverId]
  )
  const market = useLiveQuery(
    () => driver ? db.markets.get(driver.marketId) : Promise.resolve(undefined),
    [driver]
  )
  const calls = useLiveQuery(
    () => selectedDriverId ? db.calls.where('driverId').equals(selectedDriverId).reverse().sortBy('calledAt') : Promise.resolve([]),
    [selectedDriverId]
  )
  const notes = useLiveQuery(
    () => selectedDriverId ? db.notes.where('driverId').equals(selectedDriverId).reverse().sortBy('createdAt') : Promise.resolve([]),
    [selectedDriverId]
  )
  const assignments = useLiveQuery(
    async () => {
      if (!selectedDriverId) return []
      const asgns = await db.assignments.where('driverId').equals(selectedDriverId).toArray()
      return asgns
    },
    [selectedDriverId]
  )

  if (!selectedDriverId || !driver) return null

  const fullName = `${driver.firstName} ${driver.lastName}`

  async function logCall(outcome: 'answered' | 'voicemail' | 'no_answer') {
    if (!driver) return
    await db.calls.add({
      id: `c_${Date.now()}`,
      driverId: driver.id,
      userId: 'u1',
      calledAt: new Date().toISOString(),
      outcome,
      notes: callNotes || undefined,
    })
    await db.drivers.update(driver.id, { lastContactAt: new Date().toISOString() })
    setCallNotes('')
  }

  async function addNote() {
    if (!driver || !callNotes.trim()) return
    await db.notes.add({
      id: `n_${Date.now()}`,
      driverId: driver.id,
      userId: 'u1',
      body: callNotes,
      pinned: false,
      createdAt: new Date().toISOString(),
    })
    setCallNotes('')
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'calls', label: `Calls (${calls?.length ?? 0})` },
    { key: 'routes', label: `Routes (${assignments?.length ?? 0})` },
    { key: 'notes', label: `Notes (${notes?.length ?? 0})` },
  ]

  return (
    <aside className="w-96 flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-slate-800">
        <Avatar name={fullName} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-100">{fullName}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge className={STAGE_COLORS[driver.pipelineStage]}>{STAGE_LABELS[driver.pipelineStage]}</Badge>
            <Badge className={STATUS_COLORS[driver.status]}>{driver.status.replace('_', ' ')}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <a href={`tel:${driver.phone}`} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
              <Phone size={11} />{driver.phone}
            </a>
          </div>
        </div>
        <button onClick={() => setSelectedDriver(null)} className="text-slate-400 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-slate-800">
        <Button size="sm" variant="primary" onClick={() => logCall('answered')} className="flex-1">
          <Phone size={12} /> Answered
        </Button>
        <Button size="sm" variant="secondary" onClick={() => logCall('voicemail')}>
          Voicemail
        </Button>
        <Button size="sm" variant="secondary" onClick={() => logCall('no_answer')}>
          No Answer
        </Button>
      </div>

      {/* Note input */}
      <div className="px-4 py-2.5 border-b border-slate-800">
        <div className="flex gap-2">
          <input
            value={callNotes}
            onChange={e => setCallNotes(e.target.value)}
            placeholder="Add note…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <Button size="sm" variant="ghost" onClick={addNote}>
            <Plus size={12} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              tab === t.key
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Contact */}
            <Section title="Contact">
              <Row icon={<Phone size={12} />} label="Phone" value={driver.phone} />
              <Row icon={<Mail size={12} />} label="Email" value={driver.email} />
              <Row icon={<MapPin size={12} />} label="Market" value={market?.name ?? '—'} />
            </Section>

            {/* Vehicle */}
            <Section title="Vehicle">
              <Row icon={<Car size={12} />} label="Class" value={VEHICLE_LABELS[driver.vehicleClass]} />
              {driver.vehicleMake && <Row label="Make/Model" value={`${driver.vehicleYear} ${driver.vehicleMake} ${driver.vehicleModel}`} />}
            </Section>

            {/* Performance */}
            <Section title="Performance">
              <Row icon={<Star size={12} />} label="Reliability Score" value={`${driver.reliabilityScore}/100`} />
              <Row icon={<TrendingUp size={12} />} label="Acceptance Rate" value={pct(driver.acceptanceRate)} />
              <Row label="Cancellation Rate" value={pct(driver.cancellationRate)} />
              <Row label="On-Time Rate" value={pct(driver.onTimeRate)} />
              <Row label="Total Routes" value={String(driver.totalRoutes)} />
            </Section>

            {/* Preferences */}
            <Section title="Preferences">
              <Row label="Days" value={driver.preferences.days.map(d => d.toUpperCase()).join(', ') || '—'} />
              <Row label="Start Time" value={`${driver.preferences.startTimeEarliest} – ${driver.preferences.startTimeLatest}`} />
              <Row label="Stops" value={`${driver.preferences.stopMin} – ${driver.preferences.stopMax}`} />
              <Row label="Max Miles" value={`${driver.preferences.milesMax} mi`} />
              <Row label="Min Pay" value={formatCurrency(driver.preferences.payMin)} />
              <Row label="Downtown" value={driver.preferences.willingDowntown ? 'Yes' : 'No'} />
            </Section>

            {/* Docs */}
            <Section title="Documents">
              <Row icon={<FileText size={12} />} label="Insurance Expiry" value={formatDate(driver.insuranceExpiry)}
                valueClass={driver.insuranceExpiry && new Date(driver.insuranceExpiry) < new Date(Date.now() + 30*86400000) ? 'text-red-400' : ''} />
              <Row label="License Expiry" value={formatDate(driver.licenseExpiry)} />
              <Row label="Background Check" value={formatDate(driver.backgroundCheckDate)} />
            </Section>

            {/* Follow-up */}
            <Section title="Activity">
              <Row icon={<Clock size={12} />} label="Last Contact" value={formatRelative(driver.lastContactAt)} />
              <Row label="Next Follow-up" value={formatDate(driver.nextFollowupAt)}
                valueClass={driver.nextFollowupAt && new Date(driver.nextFollowupAt) < new Date() ? 'text-red-400' : ''} />
              <Row label="Member Since" value={formatDate(driver.createdAt)} />
            </Section>

            {driver.notes && (
              <Section title="Notes">
                <p className="text-xs text-slate-300 leading-relaxed">{driver.notes}</p>
              </Section>
            )}
          </div>
        )}

        {tab === 'calls' && (
          <div>
            {(calls ?? []).length === 0 && (
              <p className="text-xs text-slate-400 px-4 py-6 text-center">No calls logged yet</p>
            )}
            {(calls ?? []).map(call => (
              <div key={call.id} className="px-4 py-3 border-b border-slate-800/60">
                <div className="flex items-center justify-between mb-1">
                  <Badge className={
                    call.outcome === 'answered' ? 'bg-green-900 text-green-200' :
                    call.outcome === 'voicemail' ? 'bg-yellow-900 text-yellow-200' :
                    'bg-slate-700 text-slate-300'
                  }>{call.outcome.replace('_', ' ')}</Badge>
                  <span className="text-[10px] text-slate-400">{formatRelative(call.calledAt)}</span>
                </div>
                {call.notes && <p className="text-xs text-slate-300 mt-1">{call.notes}</p>}
                {call.nextFollowupAt && (
                  <p className="text-[10px] text-slate-400 mt-1">Follow-up: {formatDate(call.nextFollowupAt)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'routes' && (
          <div>
            {(assignments ?? []).length === 0 && (
              <p className="text-xs text-slate-400 px-4 py-6 text-center">No route assignments</p>
            )}
            {(assignments ?? []).map(a => (
              <div key={a.id} className="px-4 py-3 border-b border-slate-800/60">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-200">Route {a.routeId}</div>
                    <div className="text-[10px] text-slate-400">{a.type} · {formatDate(a.assignedAt)}</div>
                  </div>
                  <Badge className={
                    a.status === 'completed' ? 'bg-green-900 text-green-200' :
                    a.status === 'cancelled' ? 'bg-red-900 text-red-200' :
                    'bg-blue-900 text-blue-200'
                  }>{a.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div>
            {(notes ?? []).length === 0 && (
              <p className="text-xs text-slate-400 px-4 py-6 text-center">No notes yet</p>
            )}
            {(notes ?? []).map(note => (
              <div key={note.id} className="px-4 py-3 border-b border-slate-800/60">
                {note.pinned && <span className="text-[10px] text-yellow-400 font-medium">📌 Pinned</span>}
                <p className="text-xs text-slate-200 leading-relaxed mt-0.5">{note.body}</p>
                <p className="text-[10px] text-slate-500 mt-1">{formatRelative(note.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ icon, label, value, valueClass }: {
  icon?: React.ReactNode; label: string; value: string; valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <span className={cn('text-xs text-slate-200 font-medium max-w-[55%] text-right truncate', valueClass)}>
        {value}
      </span>
    </div>
  )
}
