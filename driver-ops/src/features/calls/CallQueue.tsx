import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { TopBar } from '@/components/layout/TopBar'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/ui'
import { DriverPanel } from '@/features/drivers/DriverPanel'
import { STAGE_COLORS, STAGE_LABELS, STATUS_COLORS, formatRelative, formatDate } from '@/lib/utils'
import { Phone, Clock, AlertTriangle, UserX, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Driver } from '@/types'

type QueueSection = 'followups' | 'expired_docs' | 'inactive' | 'new_responses' | 'cancelled'

interface QueueItem {
  driver: Driver
  reason: string
  urgency: 'high' | 'medium' | 'low'
  section: QueueSection
}

const SECTION_META: Record<QueueSection, { label: string; icon: React.ReactNode; color: string }> = {
  followups: { label: 'Due Follow-ups', icon: <Clock size={13} />, color: 'text-yellow-400' },
  expired_docs: { label: 'Expired / Expiring Docs', icon: <AlertTriangle size={13} />, color: 'text-red-400' },
  inactive: { label: 'Inactive Drivers', icon: <UserX size={13} />, color: 'text-slate-400' },
  new_responses: { label: 'New Survey Responses', icon: <TrendingDown size={13} />, color: 'text-blue-400' },
  cancelled: { label: 'Recent Cancellations', icon: <Phone size={13} />, color: 'text-orange-400' },
}

export function CallQueue() {
  const { selectedDriverId, setSelectedDriver } = useUIStore()
  const [activeSection, setActiveSection] = useState<QueueSection>('followups')

  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))

  const queue: QueueItem[] = []
  const now = Date.now()
  const thirtyDays = 30 * 86400000
  const ninetyDays = 90 * 86400000

  for (const driver of drivers ?? []) {
    // Overdue follow-ups
    if (driver.nextFollowupAt && new Date(driver.nextFollowupAt).getTime() < now) {
      queue.push({
        driver,
        reason: `Follow-up overdue since ${formatDate(driver.nextFollowupAt)}`,
        urgency: 'high',
        section: 'followups',
      })
    }

    // Expiring / expired docs
    if (driver.insuranceExpiry) {
      const daysLeft = (new Date(driver.insuranceExpiry).getTime() - now) / 86400000
      if (daysLeft < 30) {
        queue.push({
          driver,
          reason: daysLeft < 0 ? 'Insurance EXPIRED' : `Insurance expires in ${Math.floor(daysLeft)} days`,
          urgency: daysLeft < 0 ? 'high' : 'medium',
          section: 'expired_docs',
        })
      }
    }

    // Inactive drivers (no contact in 90 days)
    if (driver.status === 'active' && driver.lastContactAt &&
      now - new Date(driver.lastContactAt).getTime() > ninetyDays) {
      queue.push({
        driver,
        reason: `No contact in ${Math.floor((now - new Date(driver.lastContactAt).getTime()) / 86400000)} days`,
        urgency: 'low',
        section: 'inactive',
      })
    }
  }

  const sectionItems = queue.filter(q => q.section === activeSection)
  const sectionCounts: Record<QueueSection, number> = {
    followups: queue.filter(q => q.section === 'followups').length,
    expired_docs: queue.filter(q => q.section === 'expired_docs').length,
    inactive: queue.filter(q => q.section === 'inactive').length,
    new_responses: 0,
    cancelled: 0,
  }

  async function logCall(driver: Driver, outcome: 'answered' | 'voicemail' | 'no_answer') {
    await db.calls.add({
      id: `c_${Date.now()}`,
      driverId: driver.id,
      userId: 'u1',
      calledAt: new Date().toISOString(),
      outcome,
    })
    await db.drivers.update(driver.id, {
      lastContactAt: new Date().toISOString(),
      nextFollowupAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Call Queue" />
      <div className="flex flex-1 overflow-hidden">
        {/* Queue columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Section sidebar */}
          <div className="w-52 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
            <div className="p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Queue Sections</div>
              {(Object.entries(SECTION_META) as [QueueSection, typeof SECTION_META[QueueSection]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors mb-0.5',
                    activeSection === key
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  )}
                >
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="flex-1">{meta.label}</span>
                  {sectionCounts[key] > 0 && (
                    <span className={cn(
                      'text-[10px] rounded-full px-1.5 py-0.5 font-medium',
                      key === 'expired_docs' ? 'bg-red-900 text-red-300' :
                      key === 'followups' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-slate-700 text-slate-300'
                    )}>{sectionCounts[key]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Driver list */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={SECTION_META[activeSection].color}>{SECTION_META[activeSection].icon}</span>
                <span className="text-sm font-medium text-slate-100">{SECTION_META[activeSection].label}</span>
              </div>
              <span className="text-xs text-slate-400">{sectionItems.length} drivers</span>
            </div>

            {sectionItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Phone size={28} className="mb-3 opacity-30" />
                <p className="text-sm">Queue is clear</p>
              </div>
            )}

            {sectionItems.map(({ driver, reason, urgency }) => {
              const fullName = `${driver.firstName} ${driver.lastName}`
              const isSelected = selectedDriverId === driver.id
              return (
                <div
                  key={driver.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors',
                    isSelected && 'bg-blue-950/30',
                    urgency === 'high' && 'border-l-2 border-l-red-500',
                    urgency === 'medium' && 'border-l-2 border-l-yellow-500',
                  )}
                  onClick={() => setSelectedDriver(isSelected ? null : driver.id)}
                >
                  <Avatar name={fullName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">{fullName}</span>
                      <Badge className={STAGE_COLORS[driver.pipelineStage]}>{STAGE_LABELS[driver.pipelineStage]}</Badge>
                    </div>
                    <div className="text-xs text-slate-400 truncate">{reason}</div>
                    <div className="text-[10px] text-slate-500">{marketMap[driver.marketId]} · {driver.phone}</div>
                  </div>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="primary" onClick={() => logCall(driver, 'answered')}>
                      <Phone size={11} /> Call
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => logCall(driver, 'voicemail')}>VM</Button>
                    <Button size="sm" variant="ghost" onClick={() => logCall(driver, 'no_answer')}>NA</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Driver detail panel */}
        {selectedDriverId && <DriverPanel />}
      </div>
    </div>
  )
}
