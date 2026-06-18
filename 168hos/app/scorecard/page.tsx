'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WeekSelector } from '@/components/week-selector'
import { StatusBadge } from '@/components/status-badge'
import { startOfWeek, format } from 'date-fns'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

interface Scorecard {
  id?: string
  weekStart: string
  sleepHours?: number
  fitnessHours?: number
  deepWorkHours?: number
  meetingHours?: number
  familyHours?: number
  taskCompletionPct?: number
  avgEnergy?: number
  delegatedHoursSaved?: number
  notes?: string
}

const METRICS = [
  { key: 'sleepHours', label: 'Sleep Hours', target: 49, unit: 'h', description: 'Target: 7h/night = 49h/week', higherIsBetter: true },
  { key: 'fitnessHours', label: 'Fitness Hours', target: 5, unit: 'h', description: 'Target: 5h/week minimum', higherIsBetter: true },
  { key: 'deepWorkHours', label: 'Deep Work Hours', target: 20, unit: 'h', description: 'Target: 20h/week of focused work', higherIsBetter: true },
  { key: 'meetingHours', label: 'Meeting Hours', target: 10, unit: 'h', description: 'Target: under 10h/week', higherIsBetter: false },
  { key: 'familyHours', label: 'Family Hours', target: 14, unit: 'h', description: 'Target: 14h/week with family', higherIsBetter: true },
  { key: 'taskCompletionPct', label: 'Task Completion', target: 80, unit: '%', description: 'Target: 80%+ completion rate', higherIsBetter: true },
  { key: 'avgEnergy', label: 'Average Energy', target: 7, unit: '/10', description: 'Target: 7.0+ average energy', higherIsBetter: true },
  { key: 'delegatedHoursSaved', label: 'Hours Delegated/Saved', target: 5, unit: 'h', description: 'Target: 5h/week saved via delegation', higherIsBetter: true },
] as const

export default function ScorecardPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Partial<Scorecard>>({})

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/weekly-scorecard?weekStart=${weekStartStr}`)
    const data = await res.json()
    setScorecard(data)
    setLoading(false)
  }, [weekStartStr])

  useEffect(() => { load() }, [load])

  const openEdit = () => {
    setForm(scorecard || { weekStart: weekStartStr })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const payload = { ...form, weekStart: weekStartStr }
    try {
      await fetch('/api/weekly-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      toast.success('Scorecard saved')
      setDialogOpen(false)
      load()
    } catch {
      toast.error('Failed to save')
    }
  }

  const getScore = () => {
    if (!scorecard) return null
    let pass = 0; let total = 0
    for (const m of METRICS) {
      const val = scorecard[m.key] as number | undefined
      if (val != null) {
        total++
        const ratio = val / m.target
        if (m.higherIsBetter ? ratio >= 1 : ratio <= 1) pass++
      }
    }
    return total > 0 ? Math.round((pass / total) * 100) : null
  }

  const score = getScore()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Scorecard</h1>
          <p className="text-muted-foreground text-sm mt-1">Track key performance metrics against targets</p>
        </div>
        <Button onClick={openEdit}><Pencil size={14} className="mr-2" /> {scorecard ? 'Edit' : 'Add'} Scorecard</Button>
      </div>

      <WeekSelector weekStart={weekStart} onChange={setWeekStart} />

      {score !== null && (
        <Card className="border-2" style={{ borderColor: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444' }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="text-4xl font-black" style={{ color: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444' }}>
              {score}%
            </div>
            <div>
              <div className="font-semibold">Weekly Score</div>
              <div className="text-sm text-muted-foreground">
                {score >= 80 ? '🏆 Excellent week!' : score >= 60 ? '📈 Good progress, keep improving' : '⚠️ Needs attention — review and adjust'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : !scorecard ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-muted-foreground">No scorecard for this week yet</p>
            <Button className="mt-4" onClick={openEdit}>Create Scorecard</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {METRICS.map(({ key, label, target, unit, description, higherIsBetter }) => {
            const value = scorecard[key] as number | undefined
            const ratio = value != null ? value / target : null
            const status = ratio == null ? 'none' : (higherIsBetter ? ratio >= 1 : ratio <= 1) ? 'green' : (higherIsBetter ? ratio >= 0.8 : ratio <= 1.2) ? 'yellow' : 'red'
            return (
              <Card key={key} className={`border ${status === 'green' ? 'border-green-500/30' : status === 'yellow' ? 'border-yellow-500/30' : status === 'red' ? 'border-red-500/30' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {value != null ? (
                        <div className="text-xl font-bold">{value}{unit}</div>
                      ) : (
                        <div className="text-xl font-bold text-muted-foreground">—</div>
                      )}
                      <StatusBadge value={value} target={target} higherIsBetter={higherIsBetter} suffix={unit} />
                    </div>
                  </div>
                  {value != null && (
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${status === 'green' ? 'bg-green-500' : status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min((value / target) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {scorecard?.notes && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-1">Notes</div>
            <div className="text-sm text-muted-foreground">{scorecard.notes}</div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Scorecard — {format(weekStart, 'MMM d, yyyy')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {METRICS.map(({ key, label, unit }) => (
              <div key={key} className="grid grid-cols-2 items-center gap-4">
                <Label className="text-sm">{label} ({unit})</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={(form as Record<string, number | undefined>)[key] ?? ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Enter value..."
                />
              </div>
            ))}
            <div>
              <Label>Notes</Label>
              <Input value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Scorecard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
