import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { useUIStore } from '@/stores/ui'
import type { PipelineStage } from '@/types'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { STAGE_LABELS, STATUS_COLORS, formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'

const PIPELINE_COLUMNS: PipelineStage[] = [
  'prospect', 'needs_survey', 'survey_sent', 'survey_completed',
  'interested', 'qualified', 'ready', 'committed', 'active',
]

const COLUMN_COLORS: Record<string, string> = {
  prospect: 'border-t-slate-500',
  needs_survey: 'border-t-yellow-600',
  survey_sent: 'border-t-blue-600',
  survey_completed: 'border-t-blue-500',
  interested: 'border-t-indigo-500',
  qualified: 'border-t-violet-500',
  ready: 'border-t-teal-500',
  committed: 'border-t-green-600',
  active: 'border-t-emerald-500',
}

export function DriverPipeline() {
  const { setSelectedDriver } = useUIStore()
  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m.name]))

  const byStage = (stage: PipelineStage) =>
    (drivers ?? []).filter(d => d.pipelineStage === stage)

  async function moveDriver(driverId: string, stage: PipelineStage) {
    await db.drivers.update(driverId, { pipelineStage: stage, updatedAt: new Date().toISOString() })
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-3 p-4 h-full min-w-max">
        {PIPELINE_COLUMNS.map(stage => {
          const cards = byStage(stage)
          return (
            <div
              key={stage}
              className={cn(
                'flex flex-col w-52 bg-slate-800/40 rounded-xl border border-slate-700 border-t-2 flex-shrink-0',
                COLUMN_COLORS[stage]
              )}
              onDragOver={e => e.preventDefault()}
              onDrop={async e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('driverId')
                if (id) await moveDriver(id, stage)
              }}
            >
              <div className="px-3 py-2.5 border-b border-slate-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{STAGE_LABELS[stage]}</span>
                <span className="text-xs text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded-full">{cards.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map(driver => {
                  const fullName = `${driver.firstName} ${driver.lastName}`
                  return (
                    <div
                      key={driver.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('driverId', driver.id)}
                      onClick={() => setSelectedDriver(driver.id)}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 cursor-pointer hover:border-slate-500 hover:bg-slate-750 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar name={fullName} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-100 truncate">{fullName}</div>
                          <div className="text-[10px] text-slate-400 truncate">{marketMap[driver.marketId] ?? '—'}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge className={cn(STATUS_COLORS[driver.status], 'text-[10px]')}>
                          {driver.status}
                        </Badge>
                        <span className="text-[10px] text-slate-500">{formatRelative(driver.lastContactAt)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
