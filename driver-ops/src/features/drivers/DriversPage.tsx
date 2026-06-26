import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { DriverTable } from './DriverTable'
import { DriverPanel } from './DriverPanel'
import { DriverPipeline } from './DriverPipeline'
import { useUIStore } from '@/stores/ui'
import { LayoutList, Kanban, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type View = 'table' | 'pipeline'

export function DriversPage() {
  const [view, setView] = useState<View>('table')
  const { selectedDriverId } = useUIStore()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Drivers"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setView('table')}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
                  view === 'table' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <LayoutList size={12} /> Table
              </button>
              <button
                onClick={() => setView('pipeline')}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
                  view === 'pipeline' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <Kanban size={12} /> Pipeline
              </button>
            </div>
            <Button variant="primary" size="sm">
              <Plus size={13} /> Add Driver
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        {view === 'table' ? <DriverTable /> : <DriverPipeline />}
        {selectedDriverId && <DriverPanel />}
      </div>
    </div>
  )
}
