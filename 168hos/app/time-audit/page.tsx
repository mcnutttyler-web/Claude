'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WeekSelector } from '@/components/week-selector'
import { startOfWeek, format, addDays } from 'date-fns'
import { Plus, Download, Upload, Trash2, Pencil, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  color: string
  icon?: string
}

interface TimeBlock {
  id: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  activity: string
  planned: boolean
  energyRating?: number
  qualityRating?: number
  revenueImpact?: number
  completed: boolean
  notes?: string
  category: Category
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 1440
  return mins
}

export default function TimeAuditPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBlock, setEditBlock] = useState<TimeBlock | null>(null)
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    categoryId: '',
    activity: '',
    planned: true,
    energyRating: 7,
    qualityRating: 7,
    revenueImpact: 0,
    completed: true,
    notes: '',
  })

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    setLoading(true)
    const [blocksRes, catsRes] = await Promise.all([
      fetch(`/api/time-audit?weekStart=${weekStartStr}`),
      fetch('/api/categories'),
    ])
    const [blocksData, catsData] = await Promise.all([blocksRes.json(), catsRes.json()])
    setBlocks(Array.isArray(blocksData) ? blocksData : [])
    setCategories(Array.isArray(catsData) ? catsData : [])
    setLoading(false)
  }, [weekStartStr])

  useEffect(() => { load() }, [load])

  const totalMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0)
  const totalHours = totalMinutes / 60
  const remaining = 168 - totalHours

  const openAdd = () => {
    setEditBlock(null)
    setForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00', endTime: '10:00',
      categoryId: categories[0]?.id || '',
      activity: '', planned: true,
      energyRating: 7, qualityRating: 7, revenueImpact: 0,
      completed: true, notes: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (block: TimeBlock) => {
    setEditBlock(block)
    setForm({
      date: block.date.split('T')[0],
      startTime: block.startTime,
      endTime: block.endTime,
      categoryId: block.category.id,
      activity: block.activity,
      planned: block.planned,
      energyRating: block.energyRating || 7,
      qualityRating: block.qualityRating || 7,
      revenueImpact: block.revenueImpact || 0,
      completed: block.completed,
      notes: block.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const duration = calcDuration(form.startTime, form.endTime)
    const payload = {
      ...form,
      durationMinutes: duration,
      weekStart: weekStartStr,
    }
    try {
      if (editBlock) {
        await fetch(`/api/time-audit/${editBlock.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        })
        toast.success('Block updated')
      } else {
        await fetch('/api/time-audit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        })
        toast.success('Block logged')
      }
      setDialogOpen(false)
      load()
    } catch {
      toast.error('Failed to save')
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/time-audit/${id}`, { method: 'DELETE' })
    toast.success('Block deleted')
    load()
  }

  const handleExport = () => {
    window.open(`/api/time-audit?weekStart=${weekStartStr}&export=csv`, '_blank')
  }

  // Group by day
  const byDay: Record<string, TimeBlock[]> = {}
  for (const block of blocks) {
    const d = block.date.split('T')[0]
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(block)
  }

  const categoryHours: Record<string, { hours: number; color: string }> = {}
  for (const block of blocks) {
    const name = block.category.name
    if (!categoryHours[name]) categoryHours[name] = { hours: 0, color: block.category.color }
    categoryHours[name].hours += block.durationMinutes / 60
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Time Audit</h1>
          <p className="text-muted-foreground text-sm mt-1">Log every hour of your week</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1" /> Export CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus size={16} className="mr-1" /> Log Time
          </Button>
        </div>
      </div>

      <WeekSelector weekStart={weekStart} onChange={setWeekStart} />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={`${totalHours >= 168 ? 'border-green-500' : totalHours < 120 ? 'border-yellow-500' : ''}`}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">logged of 168h</div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((totalHours / 168) * 100, 100)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{remaining > 0 ? remaining.toFixed(1) : '0'}h</div>
            <div className="text-xs text-muted-foreground">unlogged</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{blocks.length}</div>
            <div className="text-xs text-muted-foreground">blocks logged</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {blocks.filter(b => b.energyRating).length > 0
                ? (blocks.filter(b => b.energyRating).reduce((s, b) => s + (b.energyRating || 0), 0) / blocks.filter(b => b.energyRating).length).toFixed(1)
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground">avg energy</div>
          </CardContent>
        </Card>
      </div>

      {/* Warning */}
      {remaining > 10 && blocks.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm">
          <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
          <span className="text-yellow-800 dark:text-yellow-300">{remaining.toFixed(1)} hours unaccounted — your week has {168} hours total.</span>
        </div>
      )}
      {totalHours >= 168 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span className="text-green-800 dark:text-green-300">Full 168 hours accounted for! 🎉</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main blocks list */}
        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : blocks.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-4xl mb-3">⏱️</div>
                <p className="text-muted-foreground">No time blocks logged for this week</p>
                <Button className="mt-4" onClick={openAdd}><Plus size={14} className="mr-1" /> Log First Block</Button>
              </CardContent>
            </Card>
          ) : (
            Array.from({ length: 7 }, (_, i) => {
              const date = addDays(weekStart, i)
              const dateStr = format(date, 'yyyy-MM-dd')
              const dayBlocks = (byDay[dateStr] || []).sort((a, b) => a.startTime.localeCompare(b.startTime))
              const dayHours = dayBlocks.reduce((s, b) => s + b.durationMinutes / 60, 0)
              if (dayBlocks.length === 0) return null
              return (
                <div key={dateStr}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold">{format(date, 'EEEE, MMM d')}</span>
                    <span className="text-xs text-muted-foreground">{dayHours.toFixed(1)}h logged</span>
                  </div>
                  <div className="space-y-2">
                    {dayBlocks.map(block => (
                      <div key={block.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group">
                        <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: block.category.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{block.activity}</span>
                            {!block.planned && <Badge variant="outline" className="text-xs px-1.5 py-0 text-yellow-600 border-yellow-400">Unplanned</Badge>}
                            {!block.completed && <Badge variant="outline" className="text-xs px-1.5 py-0 text-red-500 border-red-400">Incomplete</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                            <span>{block.category.name}</span>
                            <span>{block.startTime}–{block.endTime} ({(block.durationMinutes / 60).toFixed(1)}h)</span>
                            {block.energyRating && <span>⚡{block.energyRating}/10</span>}
                            {block.qualityRating && <span>★{block.qualityRating}/10</span>}
                            {block.revenueImpact !== undefined && block.revenueImpact !== null && <span>💰{block.revenueImpact}/3</span>}
                          </div>
                          {block.notes && <div className="text-xs text-muted-foreground mt-1 italic">{block.notes}</div>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(block)}>
                            <Pencil size={12} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(block.id)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Category sidebar */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">By Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(categoryHours).sort((a, b) => b[1].hours - a[1].hours).map(([name, { hours, color }]) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs flex-1 truncate">{name}</span>
                    <span className="text-xs font-semibold">{hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBlock ? 'Edit Time Block' : 'Log Time Block'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Activity</Label>
              <Input value={form.activity} onChange={e => setForm(f => ({ ...f, activity: e.target.value }))} placeholder="What did you do?" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Energy (1–10): {form.energyRating}</Label>
                <Input type="range" min={1} max={10} value={form.energyRating} onChange={e => setForm(f => ({ ...f, energyRating: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Quality (1–10): {form.qualityRating}</Label>
                <Input type="range" min={1} max={10} value={form.qualityRating} onChange={e => setForm(f => ({ ...f, qualityRating: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Revenue (0–3): {form.revenueImpact}</Label>
                <Input type="range" min={0} max={3} value={form.revenueImpact} onChange={e => setForm(f => ({ ...f, revenueImpact: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.planned} onChange={e => setForm(f => ({ ...f, planned: e.target.checked }))} className="rounded" />
                <span className="text-sm">Planned</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.completed} onChange={e => setForm(f => ({ ...f, completed: e.target.checked }))} className="rounded" />
                <span className="text-sm">Completed</span>
              </label>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
            <div className="text-xs text-muted-foreground">
              Duration: {(calcDuration(form.startTime, form.endTime) / 60).toFixed(2)} hours
            </div>
          </div>
          <DialogFooter>
            {editBlock && (
              <Button variant="destructive" onClick={() => { handleDelete(editBlock.id); setDialogOpen(false) }}>
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editBlock ? 'Update' : 'Log Block'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
