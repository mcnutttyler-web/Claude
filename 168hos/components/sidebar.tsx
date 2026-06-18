'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Calendar, Clock, BarChart3, ClipboardCheck,
  Settings2, GitBranch, BookOpen, Menu, X, Zap
} from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from './theme-toggle'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/ideal-week', label: 'Ideal Week', icon: Calendar },
  { href: '/time-audit', label: 'Time Audit', icon: Clock },
  { href: '/dashboard', label: 'Weekly Dashboard', icon: BarChart3 },
  { href: '/scorecard', label: 'Scorecard', icon: ClipboardCheck },
  { href: '/systems', label: 'Systems', icon: Settings2 },
  { href: '/delegation', label: 'Delegation', icon: GitBranch },
  { href: '/weekly-review', label: 'Weekly Review', icon: BookOpen },
]

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-40 h-full w-64 bg-card border-r border-border flex flex-col transition-transform duration-200',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap size={16} className="text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm leading-none">168 Hour OS</div>
              <div className="text-xs text-muted-foreground mt-0.5">CEO Operating System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">168 hrs / week</span>
          <ThemeToggle />
        </div>
      </aside>
    </>
  )
}
