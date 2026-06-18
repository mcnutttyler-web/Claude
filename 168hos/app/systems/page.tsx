'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface SystemEntry {
  id: string
  name: string
  area: string
  owner?: string
  frequency: string
  trigger?: string
  stepsSummary?: string
  sopLink?: string
  toolAutomation?: string
  estimatedTimeSaved?: number
  kpiLinked?: string
  status: string
  nextImprovementDate?: string
}

const AREAS = ['Operations', 'Marketing', 'Sales', 'Finance', 'Product', 'Admin', 'HR', 'Customer Success', 'Other']
const FREQUENCIES = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Per event', 'As needed']
const STATUSES = ['Active', 'Inactive', 'Needs Update']

const statusConfig = {
  Active: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
  Inactive: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' },
  'Needs Update': { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' },
}

const emptyForm = {
  name: '', area: 'Operations', owner: '', frequency: 'Weekly', trigger: '',
  stepsSummary: '', sopLink: '', toolAutomation: '', estimatedTimeSaved: 0,
  kpiLinked: '', status: 'Active', nextImprovementDate: '',
}

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSystem, setEditSystem] = useState<SystemEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterArea, setFilterArea] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  const load = useCallback(async () => {
    const res = await fetch('/api/systems')
    const data = await res.json()
    setSystems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditSystem(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (s: SystemEntry) => {
    setEditSystem(s)
    setForm({
      name: s.name, area: s.area, owner: s.owner || '', frequency: s.frequency,
      trigger: s.trigger || '', stepsSummary: s.stepsSummary || '',
      sopLink: s.sopLink || '', toolAutomation: s.toolAutomation || '',
      estimatedTimeSaved: s.estimatedTimeSaved || 0, kpiLinked: s.kpiLinked || '',
      status: s.status, nextImprovementDate: s.nextImprovementDate ? s.nextImprovementDate.split('T')[0] : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const payload = { ...form, estimatedTimeSaved: Number(form.estimatedTimeSaved) || 0 }
    try {
      if (editSystem) {
        await fetch(`/api/systems/${editSystem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('System updated')
      } else {
        await fetch('/api/systems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('System added')
      }
      setDialogOpen(false)
      load()
    } catch { toast.error('Failed to save') }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/systems/${id}`, { method: 'DELETE' })
    toast.success('System deleted')
    load()
  }

  const filtered = systems.filter(s =>
    (filterArea === 'All' || s.area === filterArea) &&
    (filterStatus === 'All' || s.status === filterStatus)
  )

  const totalTimeSaved = systems.reduce((s, sys) => s + (sys.estimatedTimeSaved || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Systems & SOPs</h1>
          <p className="text-muted-foreground text-sm mt-1">Track recurring systems and standard operating procedures</p>
        </div>
        <Button onClick={openAdd}><Plus size={14} className="mr-2" /> Add System</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{systems.length}</div><div className="text-xs text-muted-foreground">Total Systems</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-500">{systems.filter(s => s.status === 'Active').length}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-yellow-500">{systems.filter(s => s.status === 'Needs Update').length}</div><div className="text-xs text-muted-foreground">Need Update</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{totalTimeSaved.toFixed(0)}h</div><div className="text-xs text-muted-foreground">Weekly Hours Saved</div></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Areas</SelectItem>
            {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center"><div className="text-4xl mb-3">⚙️</div><p className="text-muted-foreground">No systems yet</p><Button className="mt-4" onClick={openAdd}>Add First System</Button></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(sys => {
            const sc = statusConfig[sys.status as keyof typeof statusConfig] || statusConfig.Active
            return (
              <Card key={sys.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{sys.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg}`}>{sys.status}</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{sys.area}</span>
                        <span>·</span>
                        <span>{sys.frequency}</span>
                        {sys.owner && <><span>·</span><span>Owner: {sys.owner}</span></>}
                        {sys.estimatedTimeSaved && <><span>·</span><span className="text-green-600 dark:text-green-400">Saves {sys.estimatedTimeSaved}h/wk</span></>}
                      </div>
                      {sys.stepsSummary && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{sys.stepsSummary}</p>}
                      {sys.toolAutomation && <p className="text-xs text-blue-500 mt-1">🔧 {sys.toolAutomation}</p>}
                      {sys.kpiLinked && <p className="text-xs text-purple-500 mt-0.5">📊 KPI: {sys.kpiLinked}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => openEdit(sys)}><Pencil size={12} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDelete(sys.id)}><Trash2 size={12} /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editSystem ? 'Edit System' : 'Add System'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>System Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Review" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Area</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Owner</Label><Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Who runs it?" /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Trigger</Label><Input value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))} placeholder="What starts it?" /></div>
            <div><Label>Steps Summary</Label><Input value={form.stepsSummary} onChange={e => setForm(f => ({ ...f, stepsSummary: e.target.value }))} placeholder="Brief description of steps" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SOP Link</Label><Input value={form.sopLink} onChange={e => setForm(f => ({ ...f, sopLink: e.target.value }))} placeholder="Notion/Doc URL" /></div>
              <div><Label>Tool / Automation</Label><Input value={form.toolAutomation} onChange={e => setForm(f => ({ ...f, toolAutomation: e.target.value }))} placeholder="e.g. Zapier + Notion" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Est. Time Saved (h/wk)</Label><Input type="number" step="0.5" value={form.estimatedTimeSaved} onChange={e => setForm(f => ({ ...f, estimatedTimeSaved: Number(e.target.value) }))} /></div>
              <div><Label>KPI Linked</Label><Input value={form.kpiLinked} onChange={e => setForm(f => ({ ...f, kpiLinked: e.target.value }))} placeholder="e.g. Revenue, Churn" /></div>
            </div>
            <div><Label>Next Improvement Date</Label><Input type="date" value={form.nextImprovementDate} onChange={e => setForm(f => ({ ...f, nextImprovementDate: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            {editSystem && <Button variant="destructive" onClick={() => { handleDelete(editSystem.id); setDialogOpen(false) }}><Trash2 size={14} className="mr-1" /> Delete</Button>}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editSystem ? 'Update' : 'Add System'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
