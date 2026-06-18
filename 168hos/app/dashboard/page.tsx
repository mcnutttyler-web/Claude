'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WeekSelector } from '@/components/week-selector'
import { startOfWeek, format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

interface Category {
  id: string
  name: string
  color: string
  icon?: string
}

interface IdealBlock {
  startTime: string
  endTime: string
  category: Category
}

interface AuditBlock {
  durationMinutes: number
  energyRating?: number
  category: Category
}

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function WeeklyDashboardPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [auditBlocks, setAuditBlocks] = useState<AuditBlock[]>([])
  const [idealBlocks, setIdealBlocks] = useState<IdealBlock[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    setLoading(true)
    const [auditRes, idealRes, catsRes] = await Promise.all([
      fetch(`/api/time-audit?weekStart=${weekStartStr}`),
      fetch('/api/ideal-week'),
      fetch('/api/categories'),
    ])
    const [auditData, idealData, catsData] = await Promise.all([
      auditRes.json(), idealRes.json(), catsRes.json()
    ])
    setAuditBlocks(Array.isArray(auditData) ? auditData : [])
    setIdealBlocks(Array.isArray(idealData) ? idealData : [])
    setCategories(Array.isArray(catsData) ? catsData : [])
    setLoading(false)
  }, [weekStartStr])

  useEffect(() => { load() }, [load])

  // Compute actual hours by category
  const actualByCat: Record<string, number> = {}
  for (const b of auditBlocks) {
    const n = b.category.name
    actualByCat[n] = (actualByCat[n] || 0) + b.durationMinutes / 60
  }

  // Compute ideal hours by category
  const idealByCat: Record<string, number> = {}
  for (const b of idealBlocks) {
    const start = timeToMins(b.startTime)
    let end = timeToMins(b.endTime)
    if (end <= start) end += 1440
    const hrs = (end - start) / 60
    const n = b.category.name
    idealByCat[n] = (idealByCat[n] || 0) + hrs
  }

  // Bar chart data: planned vs actual
  const allCatNames = Array.from(new Set([...Object.keys(actualByCat), ...Object.keys(idealByCat)]))
  const barData = allCatNames.map(name => ({
    name: name.length > 10 ? name.substring(0, 8) + '..' : name,
    fullName: name,
    actual: +(actualByCat[name] || 0).toFixed(1),
    planned: +(idealByCat[name] || 0).toFixed(1),
    color: categories.find(c => c.name === name)?.color || '#888',
  }))

  // Pie chart data
  const pieData = Object.entries(actualByCat)
    .filter(([, h]) => h > 0)
    .map(([name, hours]) => ({
      name,
      value: +hours.toFixed(1),
      color: categories.find(c => c.name === name)?.color || '#888',
    }))

  // Avg energy by category
  const energyByCat: Record<string, { sum: number; count: number }> = {}
  for (const b of auditBlocks) {
    if (b.energyRating) {
      const n = b.category.name
      if (!energyByCat[n]) energyByCat[n] = { sum: 0, count: 0 }
      energyByCat[n].sum += b.energyRating
      energyByCat[n].count++
    }
  }
  const energyData = Object.entries(energyByCat).map(([name, { sum, count }]) => ({
    name: name.length > 10 ? name.substring(0, 8) + '..' : name,
    fullName: name,
    energy: +(sum / count).toFixed(1),
    color: categories.find(c => c.name === name)?.color || '#888',
  }))

  // Key stats
  const deepWork = actualByCat['Deep Work'] || 0
  const sleep = actualByCat['Sleep'] || 0
  const fitness = actualByCat['Health'] || 0
  const meetings = actualByCat['Meetings'] || 0
  const admin = actualByCat['Admin'] || 0

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium mb-1">{label}</p>
          {payload.map((p) => (
            <p key={p.name} className="text-xs" style={{ color: p.color }}>
              {p.name}: {p.value}h
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weekly Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Planned vs actual across all 168 hours</p>
      </div>

      <WeekSelector weekStart={weekStart} onChange={setWeekStart} />

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Deep Work', value: deepWork, target: 20, unit: 'h', color: '#3b82f6' },
          { label: 'Sleep', value: sleep, target: 49, unit: 'h', color: '#6366f1' },
          { label: 'Fitness', value: fitness, target: 5, unit: 'h', color: '#22c55e' },
          { label: 'Meetings', value: meetings, target: 10, unit: 'h', color: '#8b5cf6', lowerBetter: true },
          { label: 'Admin', value: admin, target: 7, unit: 'h', color: '#64748b', lowerBetter: true },
        ].map(({ label, value, target, unit, color, lowerBetter }) => {
          const ratio = value / target
          const good = lowerBetter ? ratio <= 1 : ratio >= 1
          const ok = lowerBetter ? ratio <= 1.2 : ratio >= 0.8
          const statusColor = good ? 'text-green-500' : ok ? 'text-yellow-500' : 'text-red-500'
          return (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`text-2xl font-bold ${statusColor}`}>{value.toFixed(1)}{unit}</div>
                <div className="text-xs text-muted-foreground">target: {target}{unit}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-72 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Planned vs Actual bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Planned vs Actual Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="planned" name="Planned" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" radius={[2, 2, 0, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">168-Hour Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No data for this week</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? '').substring(0, 6)} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}h`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Energy by category */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Average Energy by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {energyData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No energy ratings logged</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={energyData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                    <Tooltip formatter={(v) => [`${v}/10`, 'Avg Energy']} />
                    <Bar dataKey="energy" radius={[0, 4, 4, 0]}>
                      {energyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Variance table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Variance from Ideal Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {barData.map(({ fullName, actual, planned, color }) => {
                  const variance = actual - planned
                  return (
                    <div key={fullName} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs w-28 shrink-0 truncate">{fullName}</span>
                      <div className="flex-1 text-xs text-muted-foreground">{actual}h actual / {planned}h ideal</div>
                      <span className={`text-xs font-semibold w-14 text-right ${variance > 0 ? 'text-green-500' : variance < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(1)}h
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
