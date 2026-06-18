'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  color: string
  icon?: string
}

interface IdealBlock {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  activity: string
  goalOutcome?: string
  energyTarget?: number
  color?: string
  category: Category
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5) // 5am to 11pm

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToPx(minutes: number, pxPerHour: number): number {
  return (minutes / 60) * pxPerHour
}

const PX_PER_HOUR = 60

export default function IdealWeekPage() {
  const [blocks, setBlocks] = useState<IdealBlock[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBlock, setEditBlock] = useState<IdealBlock | null>(null)
  const [form, setForm] = useState({
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    categoryId: '',
    activity: '',
    goalOutcome: '',
    energyTarget: 8,
  })

  const load = useCallback(async () => {
    const [blocksRes, catsRes] = await Promise.all([
      fetch('/api/ideal-week'),
      fetch('/api/categories'),
    ])
    const [blocksData, catsData] = await Promise.all([blocksRes.json(), catsRes.json()])
    setBlocks(Array.isArray(blocksData) ? blocksData : [])
    setCategories(Array.isArray(catsData) ? catsData : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = (dayOfWeek: number = 1) => {
    setEditBlock(null)
    setForm({ dayOfWeek, startTime: '09:00', endTime: '10:00', categoryId: categories[0]?.id || '', activity: '', goalOutcome: '', energyTarget: 8 })
    setDialogOpen(true)
  }

  const openEdit = (block: IdealBlock) => {
    setEditBlock(block)
    setForm({
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      categoryId: block.category.id,
      activity: block.activity,
      goalOutcome: block.goalOutcome || '',
      energyTarget: block.energyTarget || 8,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const cat = categories.find(c => c.id === form.categoryId)
    const payload = { ...form, color: cat?.color }
    try {
      if (editBlock) {
        await fetch(`/api/ideal-week/${editBlock.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('Block updated')
      } else {
        await fetch('/api/ideal-week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('Block added')
      }
      setDialogOpen(false)
      load()
    } catch {
      toast.error('Failed to save')
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/ideal-week/${id}`, { method: 'DELETE' })
    toast.success('Block deleted')
    load()
  }

  // Category hours summary
  const categoryHours: Record<string, number> = {}
  for (const block of blocks) {
    const start = timeToMinutes(block.startTime)
    let end = timeToMinutes(block.endTime)
    if (end <= start) end += 1440
    const mins = end - start
    const name = block.category.name
    categoryHours[name] = (categoryHours[name] || 0) + mins / 60
  }
  const totalIdealHours = Object.values(categoryHours).reduce((a, b) => a + b, 0)

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-muted rounded" /><div className="h-96 bg-muted rounded" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ideal Week</h1>
          <p className="text-muted-foreground text-sm mt-1">Design your perfect 168-hour week</p>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus size={16} className="mr-2" /> Add Block
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Calendar grid */}
        <div className="xl:col-span-3 overflow-x-auto">
          <Card>
            <CardContent className="p-0">
              {/* Day headers */}
              <div className="grid border-b border-border" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                <div className="p-2" />
                {DAYS.map(d => (
                  <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground border-l border-border">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid body */}
              <div className="relative" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                  {/* Time labels + rows */}
                  {HOURS.map(hour => (
                    <div key={hour} className="contents">
                      <div className="border-b border-border p-1 text-right pr-2" style={{ height: `${PX_PER_HOUR}px` }}>
                        <span className="text-xs text-muted-foreground">{hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`}</span>
                      </div>
                      {DAYS.map((_, dayIdx) => (
                        <div
                          key={dayIdx}
                          className="border-b border-l border-border hover:bg-muted/30 cursor-pointer transition-colors"
                          style={{ height: `${PX_PER_HOUR}px` }}
                          onClick={() => openAdd(dayIdx)}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Positioned blocks */}
                {blocks.map(block => {
                  const startMins = timeToMinutes(block.startTime)
                  const endMins = timeToMinutes(block.endTime)
                  const topOffset = minutesToPx(startMins - 5 * 60, PX_PER_HOUR)
                  const height = minutesToPx(endMins > startMins ? endMins - startMins : 1440 - startMins + endMins, PX_PER_HOUR)
                  const colWidth = `calc((100% - 56px) / 7)`
                  const leftOffset = `calc(56px + ${block.dayOfWeek} * ${colWidth})`

                  if (topOffset < 0 || topOffset > HOURS.length * PX_PER_HOUR) return null

                  return (
                    <div
                      key={block.id}
                      className="absolute rounded overflow-hidden group cursor-pointer"
                      style={{
                        top: topOffset,
                        left: leftOffset,
                        width: `calc((100% - 56px) / 7 - 2px)`,
                        height: Math.max(height, 20),
                        backgroundColor: block.color || block.category.color,
                        opacity: 0.85,
                        zIndex: 10,
                      }}
                      onClick={(e) => { e.stopPropagation(); openEdit(block) }}
                    >
                      <div className="p-1 h-full flex flex-col">
                        <div className="text-white text-[10px] font-semibold leading-tight truncate">{block.activity}</div>
                        {height > 30 && <div className="text-white/80 text-[9px] leading-tight">{block.startTime}–{block.endTime}</div>}
                      </div>
                      <button
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDelete(block.id) }}
                      >
                        <Trash2 size={10} className="text-white" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Hours by Category</CardTitle>
              <p className="text-xs text-muted-foreground">Total: {totalIdealHours.toFixed(1)} / 168h</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(categoryHours).sort((a, b) => b[1] - a[1]).map(([name, hrs]) => {
                  const cat = categories.find(c => c.name === name)
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color }} />
                      <span className="text-xs flex-1 truncate">{name}</span>
                      <span className="text-xs font-medium">{hrs.toFixed(1)}h</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs">{cat.icon} {cat.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editBlock ? 'Edit Block' : 'Add Ideal Block'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Day</Label>
                <Select value={String(form.dayOfWeek)} onValueChange={v => setForm(f => ({ ...f, dayOfWeek: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
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
              <Input value={form.activity} onChange={e => setForm(f => ({ ...f, activity: e.target.value }))} placeholder="What are you doing?" />
            </div>
            <div>
              <Label>Goal / Outcome</Label>
              <Input value={form.goalOutcome} onChange={e => setForm(f => ({ ...f, goalOutcome: e.target.value }))} placeholder="What does success look like?" />
            </div>
            <div>
              <Label>Energy Target (1–10): {form.energyTarget}</Label>
              <Input type="range" min={1} max={10} value={form.energyTarget} onChange={e => setForm(f => ({ ...f, energyTarget: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            {editBlock && (
              <Button variant="destructive" onClick={() => { handleDelete(editBlock.id); setDialogOpen(false) }}>
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editBlock ? <><Pencil size={14} className="mr-1" /> Update</> : <><Plus size={14} className="mr-1" /> Add</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
