import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui'
import {
  LayoutDashboard, Users, Route, Phone, Calendar,
  Search, Settings, ChevronLeft, ChevronRight, Truck,
} from 'lucide-react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/drivers', icon: Users, label: 'Drivers' },
  { to: '/routes', icon: Route, label: 'Routes' },
  { to: '/calls', icon: Phone, label: 'Call Queue' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside className={cn(
      'flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200 shrink-0',
      sidebarCollapsed ? 'w-14' : 'w-52',
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4 border-b border-slate-800">
        <div className="size-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Truck size={14} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-sm font-bold text-white leading-none">DriverOps</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Operations Platform</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-blue-600/20 text-blue-400 font-medium'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
            )}
          >
            <Icon size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
