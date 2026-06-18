'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Zap, Users, Target, Minus } from 'lucide-react'
import { toast } from 'sonner'

interface DelegationTask {
  id: string
  task: string
  frequency: string
  strategicImpact: number
  requiresJudgment: number
  sopExists: boolean
  automationPotential: number
  recommendation?: string
  notes?: string
}

const FREQUENCIES = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Ad-hoc']

const recConfig = {
  Automate: { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400', icon: Zap },
  Delegate: { color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400', icon: Users },
  Keep: { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400', icon: Target },
  Eliminate: { color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400', icon: Minus },
}

function calcRecommendation(t: { requiresJudgment: number; automationPotential: number; sopExists: boolean; strategicImpact: number }): string {
  if (t.requiresJudgment <= 2 && t.automationPotential >= 4) return 'Automate'
  if (t.requiresJudgment <= 2 && t.sopExists) return 'Delegate'
  if (t.strategicImpact >= 4 && t.requiresJudgment >= 4) return 'Keep'
  if (t.strategicImpact <= 2 && t.requiresJudgment <= 2) return 'Eliminate'
  return 'Keep'
}

const emptyForm = { task: '', frequency: 'Weekly', strategicImpact: 3, requiresJudgment: 3, sopExists: false, automationPotential: 3, notes: '' }

export default function DelegationPage() {
  const [tasks, setTasks] = useState<DelegationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTask, setEditTask] = useState<DelegationTask | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterRec, setFilterRec] = useState('All')

  const load = useCallback(async () => {
    const res = await fetch('/api/delegation')
    const data = await res.json()
    setTasks(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const previewRec = calcRecommendation(form)

  const openAdd = () => {
    setEditTask(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (t: DelegationTask) => {
    setEditTask(t)
    setForm({ task: t.task, frequency: t.frequency, strategicImpact: t.strategicImpact, requiresJudgment: t.requiresJudgment, sopExists: t.sopExists, automationPotential: t.automationPotential, notes: t.notes || '' })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editTask) {
        await fetch(`/api/delegation/${editTask.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('Task updated')
      } else {
        await fetch('/api/delegation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('Task added')
      }
      setDialogOpen(false)
      load()
    } catch { toast.error('Failed to save') }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/delegation/${id}`, { method: 'DELETE' })
    toast.success('Task deleted')
    load()
  }

  const filtered = tasks.filter(t => filterRec === 'All' || t.recommendation === filterRec)

  const counts = { Automate: 0, Delegate: 0, Keep: 0, Eliminate: 0 }
  for (const t of tasks) {
    const r = (t.recommendation || 'Keep') as keyof typeof counts
    counts[r] = (counts[r] || 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Delegation Matrix</h1>
          <p className="text-muted-foreground text-sm mt-1">Decide what to automate, delegate, keep, or eliminate</p>
        </div>
        <Button onClick={openAdd}><Plus size={14} className="mr-2" /> Add Task</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(recConfig) as [string, { color: string; icon: React.ElementType }][]).map(([rec, { color, icon: Icon }]) => (
          <button key={rec} className={`text-left p-4 rounded-lg border transition-all ${filterRec === rec ? 'ring-2 ring-primary' : ''} bg-card border-border hover:bg-muted/50`} onClick={() => setFilterRec(filterRec === rec ? 'All' : rec)}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} />
              <span className="text-xs font-medium">{rec}</span>
            </div>
            <div className="text-2xl font-bold">{counts[rec as keyof typeof counts]}</div>
          </button>
        ))}
      </div>

      {filterRec !== 'All' && (
        <Button variant="outline" size="sm" onClick={() => setFilterRec('All')}>Clear Filter</Button>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center"><div className="text-4xl mb-3">📋</div><p className="text-muted-foreground">No tasks yet</p><Button className="mt-4" onClick={openAdd}>Add First Task</Button></CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-4 font-semibold text-muted-foreground">Task</th>
                <th className="pb-3 pr-4 font-semibold text-muted-foreground hidden md:table-cell">Frequency</th>
                <th className="pb-3 pr-4 font-semibold text-muted-foreground hidden lg:table-cell">Strategic</th>
                <th className="pb-3 pr-4 font-semibold text-muted-foreground hidden lg:table-cell">Judgment</th>
                <th className="pb-3 pr-4 font-semibold text-muted-foreground hidden lg:table-cell">Automation</th>
                <th className="pb-3 pr-4 font-semibold text-muted-foreground">Recommendation</th>
                <th className="pb-3 font-semibold text-muted-foreground w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const rec = (t.recommendation || 'Keep') as keyof typeof recConfig
                const rc = recConfig[rec] || recConfig.Keep
                const Icon = rc.icon
                return (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/30 group">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{t.task}</div>
                      {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
                      {t.sopExists && <span className="text-xs text-green-600">✓ SOP</span>}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground hidden md:table-cell">{t.frequency}</td>
                    <td className="py-3 pr-4 hidden lg:table-cell"><div className="flex gap-0.5">{[...Array(5)].map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i < t.strategicImpact ? 'bg-primary' : 'bg-muted'}`} />)}</div></td>
                    <td className="py-3 pr-4 hidden lg:table-cell"><div className="flex gap-0.5">{[...Array(5)].map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i < t.requiresJudgment ? 'bg-orange-400' : 'bg-muted'}`} />)}</div></td>
                    <td className="py-3 pr-4 hidden lg:table-cell"><div className="flex gap-0.5">{[...Array(5)].map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i < t.automationPotential ? 'bg-blue-400' : 'bg-muted'}`} />)}</div></td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${rc.color}`}>
                        <Icon size={10} /> {rec}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil size={12} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 size={12} /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editTask ? 'Edit Task' : 'Add Task'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Task Name</Label><Input value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))} placeholder="What's the task?" /></div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Strategic Impact (1–5): {form.strategicImpact}</Label>
              <Input type="range" min={1} max={5} value={form.strategicImpact} onChange={e => setForm(f => ({ ...f, strategicImpact: Number(e.target.value) }))} />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5"><span>Low</span><span>High</span></div>
            </div>
            <div>
              <Label>Requires Founder Judgment (1–5): {form.requiresJudgment}</Label>
              <Input type="range" min={1} max={5} value={form.requiresJudgment} onChange={e => setForm(f => ({ ...f, requiresJudgment: Number(e.target.value) }))} />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5"><span>Anyone can do it</span><span>Must be me</span></div>
            </div>
            <div>
              <Label>Automation Potential (1–5): {form.automationPotential}</Label>
              <Input type="range" min={1} max={5} value={form.automationPotential} onChange={e => setForm(f => ({ ...f, automationPotential: Number(e.target.value) }))} />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5"><span>Manual</span><span>Fully automatable</span></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.sopExists} onChange={e => setForm(f => ({ ...f, sopExists: e.target.checked }))} className="rounded" />
              <span className="text-sm">SOP exists for this task</span>
            </label>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional context..." /></div>
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-semibold ${(recConfig[previewRec as keyof typeof recConfig] || recConfig.Keep).color}`}>
              Recommendation: {previewRec}
            </div>
          </div>
          <DialogFooter>
            {editTask && <Button variant="destructive" onClick={() => { handleDelete(editTask.id); setDialogOpen(false) }}><Trash2 size={14} className="mr-1" /> Delete</Button>}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editTask ? 'Update' : 'Add Task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
