'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Clock, Zap, Target, TrendingUp, Calendar, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react'
import { startOfWeek, format, addWeeks } from 'date-fns'

interface Category {
  id: string
  name: string
  color: string
  icon?: string
}

interface TimeBlock {
  id: string
  activity: string
  startTime: string
  endTime: string
  durationMinutes: number
  date: string
  planned: boolean
  energyRating?: number
  completed: boolean
  category: Category
}

interface Scorecard {
  sleepHours?: number
  fitnessHours?: number
  deepWorkHours?: number
  meetingHours?: number
  familyHours?: number
  taskCompletionPct?: number
  avgEnergy?: number
  delegatedHoursSaved?: number
}

export default function DashboardPage() {
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      const [blocksRes, scorecardRes, categoriesRes] = await Promise.all([
        fetch(`/api/time-audit?weekStart=${weekStartStr}`),
        fetch(`/api/weekly-scorecard?weekStart=${weekStartStr}`),
        fetch('/api/categories'),
      ])
      const [blocksData, scorecardData, categoriesData] = await Promise.all([
        blocksRes.json(),
        scorecardRes.json(),
        categoriesRes.json(),
      ])
      setBlocks(Array.isArray(blocksData) ? blocksData : [])
      setScorecard(scorecardData)
      setCategories(Array.isArray(categoriesData) ? categoriesData : [])
      setLoading(false)
    }
    load()
  }, [weekStartStr])

  const totalMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0)
  const totalHours = totalMinutes / 60
  const remainingHours = 168 - totalHours
  const completionPct = Math.min((totalHours / 168) * 100, 100)

  const categoryHours: Record<string, number> = {}
  for (const block of blocks) {
    const name = block.category.name
    categoryHours[name] = (categoryHours[name] || 0) + block.durationMinutes / 60
  }

  const topCategories = Object.entries(categoryHours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const recentBlocks = [...blocks]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const avgEnergy = blocks.filter(b => b.energyRating).length > 0
    ? blocks.filter(b => b.energyRating).reduce((sum, b) => sum + (b.energyRating || 0), 0) / blocks.filter(b => b.energyRating).length
    : 0

  const quickActions = [
    { label: 'Log Time Block', href: '/time-audit', icon: Clock, color: 'bg-blue-500' },
    { label: 'View Ideal Week', href: '/ideal-week', icon: Calendar, color: 'bg-purple-500' },
    { label: 'Weekly Review', href: '/weekly-review', icon: CheckCircle, color: 'bg-green-500' },
    { label: 'View Scorecard', href: '/scorecard', icon: Target, color: 'bg-orange-500' },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Good {getGreeting()}, CEO 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Week of {format(weekStart, 'MMMM d')} — {format(addWeeks(weekStart, 1), 'MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-blue-500" />
              <span className="text-xs text-muted-foreground font-medium">Hours Logged</span>
            </div>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">of 168 hrs</div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-yellow-500" />
              <span className="text-xs text-muted-foreground font-medium">Avg Energy</span>
            </div>
            <div className="text-2xl font-bold">{avgEnergy > 0 ? avgEnergy.toFixed(1) : '—'}</div>
            <div className="text-xs text-muted-foreground">out of 10</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-green-500" />
              <span className="text-xs text-muted-foreground font-medium">Deep Work</span>
            </div>
            <div className="text-2xl font-bold">{(categoryHours['Deep Work'] || 0).toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">target: 20h</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-purple-500" />
              <span className="text-xs text-muted-foreground font-medium">Completion</span>
            </div>
            <div className="text-2xl font-bold">{scorecard?.taskCompletionPct ? `${scorecard.taskCompletionPct}%` : '—'}</div>
            <div className="text-xs text-muted-foreground">task rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Warning if under-logged */}
      {totalHours < 120 && blocks.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span className="text-sm text-yellow-800 dark:text-yellow-300">
            You&apos;ve logged {totalHours.toFixed(1)} hrs — {remainingHours.toFixed(1)} hrs unaccounted for this week.
          </span>
          <Link href="/time-audit" className="ml-auto">
            <Button size="sm" variant="outline">Log Time</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">This Week by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No time logged yet this week</p>
                <Link href="/time-audit" className="mt-2 inline-block">
                  <Button size="sm" className="mt-2">Start Logging</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {topCategories.map(([name, hours]) => {
                  const cat = categories.find(c => c.name === name)
                  const pct = (hours / 168) * 100
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat?.color || '#888' }} />
                      <span className="text-sm w-32 shrink-0">{name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 5, 100)}%`, backgroundColor: cat?.color || '#888' }} />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{hours.toFixed(1)}h</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quickActions.map(({ label, href, icon: Icon, color }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer group">
                    <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                      <Icon size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <ArrowRight size={14} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent blocks */}
      {recentBlocks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Time Blocks</CardTitle>
              <Link href="/time-audit">
                <Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight size={12} className="ml-1" /></Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentBlocks.map(block => (
                <div key={block.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: block.category.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{block.activity}</div>
                    <div className="text-xs text-muted-foreground">{block.category.name} · {format(new Date(block.date), 'EEE MMM d')} · {block.startTime}–{block.endTime}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {block.energyRating && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">⚡{block.energyRating}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{(block.durationMinutes / 60).toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
