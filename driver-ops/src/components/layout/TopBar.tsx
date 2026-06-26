import { Search, Bell, User } from 'lucide-react'
import { useUIStore } from '@/stores/ui'
import { Button } from '@/components/ui/Button'

interface TopBarProps {
  title: string
  actions?: React.ReactNode
}

export function TopBar({ title, actions }: TopBarProps) {
  const { setCommandOpen } = useUIStore()

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
      <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCommandOpen(true)}
          className="text-slate-400 hover:text-slate-200"
        >
          <Search size={14} />
          <span className="hidden sm:inline text-xs">Search</span>
          <kbd className="hidden sm:inline text-[10px] bg-slate-700 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </Button>
        <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
          <Bell size={15} />
        </button>
        <div className="size-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-semibold text-white">
          AO
        </div>
      </div>
    </header>
  )
}
