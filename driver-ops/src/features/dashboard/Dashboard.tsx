import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'
import { TopBar } from '@/components/layout/TopBar'
import { Stat } from '@/components/ui/Stat'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import {
  Users, Route, Phone, CheckCircle, AlertTriangle,
  TrendingUp, Clock, XCircle,
} from 'lucide-react'
import { STAGE_COLORS, STAGE_LABELS, ROUTE_STATUS_COLORS, formatRelative, formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/ui'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export function Dashboard() {
  const navigate = useNavigate()
  const { setSelectedDriver } = useUIStore()

  const drivers = useLiveQuery(() => db.drivers.toArray(), [])
  const routes = useLiveQuery(() => db.routes.toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), [])
  const calls = useLiveQuery(() => db.calls.orderBy('calledAt').reverse().limit(5).toArray(), [])
  const allDrivers = drivers ?? []
  const allRoutes = routes ?? []

  const activeDrivers = allDrivers.filter(d => d.status === 'active').length
  const openRoutes = allRoutes.filter(r => ['open', 'needs_driver'].includes(r.status)).length
  const committedRoutes = allRoutes.filter(r => ['committed', 'assigned'].includes(r.status)).length
  const totalRoutes = allRoutes.filter(r => r.status !== 'cancelled').length
  const coveragePct = totalRoutes > 0 ? Math.round((committedRoutes / totalRoutes) * 100) : 0
  const expiringDocs = allDrivers.filter(d => {
    if (!d.insuranceExpiry) return false
    const days = (new Date(d.insuranceExpiry).getTime() - Date.now()) / 86400000
    return days > 0 && days < 30
  }).length
  const dueTodayTasks = (tasks ?? []).filter(t => {
    const due = new Date(t.dueAt)
    const today = new Date()
    return due.toDateString() === today.toDateString()
  }).length

  // stage breakdown for chart
  const stageData = [
    'prospect','interested','qualified','ready','committed','active','inactive',
  ].map(stage => ({
    stage: STAGE_LABELS[stage],
    count: allDrivers.filter(d => d.pipelineStage === stage).length,
    fill: stage === 'active' ? '#22c55e' : stage === 'inactive' ? '#64748b' : '#3b82f6',
  }))

  // recent calls with driver names
  const callDriverIds = (calls ?? []).map(c => c.driverId)

  const recentCalls = useLiveQuery(async () => {
    if (!calls) return []
    const drivers = await db.drivers.where('id').anyOf(callDriverIds).toArray()
    const dMap = Object.fromEntries(drivers.map(d => [d.id, d]))
    return (calls ?? []).map(c => ({ call: c, driver: dMap[c.driverId] }))
  }, [calls])

  const urgentRoutes = allRoutes
    .filter(r => ['open', 'needs_driver'].includes(r.status) && r.priority !== 'low')
    .sort((a, b) => {
      const p = { critical: 4, high: 3, normal: 2, low: 1 }
      return p[b.priority] - p[a.priority]
    })
    .slice(0, 6)

  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const marketMap = Object.fromEntries((markets ?? []).map(m => [m.id, m]))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
          <Stat label="Active Drivers" value={activeDrivers} icon={Users} color="green"
            sub={`of ${allDrivers.length} total`} />
          <Stat label="Coverage" value={`${coveragePct}%`} icon={TrendingUp} color="blue"
            sub={`${committedRoutes}/${totalRoutes} routes`} />
          <Stat label="Open Routes" value={openRoutes} icon={Route} color={openRoutes > 5 ? 'red' : 'default'}
            sub="need assignment" />
          <Stat label="Tasks Due Today" value={dueTodayTasks} icon={Clock} color={dueTodayTasks > 0 ? 'yellow' : 'default'}
            sub="pending actions" />
          <Stat label="Expiring Docs" value={expiringDocs} icon={AlertTriangle} color={expiringDocs > 0 ? 'red' : 'default'}
            sub="within 30 days" />
          <Stat label="Committed" value={committedRoutes} icon={CheckCircle} color="green"
            sub="routes filled" />
          <Stat label="Cancelled" value={allRoutes.filter(r => r.status === 'cancelled').length}
            icon={XCircle} sub="this period" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pipeline chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Driver Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stageData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    itemStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stageData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Urgent routes */}
          <Card>
            <CardHeader>
              <CardTitle>Urgent Routes</CardTitle>
              <button onClick={() => navigate('/routes')} className="text-xs text-blue-400 hover:text-blue-300">View all</button>
            </CardHeader>
            <CardContent className="p-0">
              {urgentRoutes.length === 0 && (
                <p className="text-xs text-slate-400 px-4 py-4">All routes covered ✓</p>
              )}
              {urgentRoutes.map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => navigate('/routes')}
                >
                  <div>
                    <div className="text-xs font-medium text-slate-200">
                      {marketMap[r.marketId]?.name ?? r.marketId}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {r.date} · {r.stops} stops · ${r.pay}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.priority === 'critical' && <Badge className="bg-red-900 text-red-200">CRITICAL</Badge>}
                    {r.priority === 'high' && <Badge className="bg-orange-900 text-orange-200">HIGH</Badge>}
                    <Badge className={ROUTE_STATUS_COLORS[r.status]}>{r.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent calls */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Calls</CardTitle>
              <button onClick={() => navigate('/calls')} className="text-xs text-blue-400 hover:text-blue-300">Open call queue</button>
            </CardHeader>
            <CardContent className="p-0">
              {(recentCalls ?? []).map(({ call, driver }) => (
                <div
                  key={call.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => {
                    if (driver) { setSelectedDriver(driver.id); navigate('/drivers') }
                  }}
                >
                  {driver && <Avatar name={`${driver.firstName} ${driver.lastName}`} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{call.notes ?? 'No notes'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge className={
                      call.outcome === 'answered' ? 'bg-green-900 text-green-200' :
                      call.outcome === 'voicemail' ? 'bg-yellow-900 text-yellow-200' :
                      'bg-slate-700 text-slate-300'
                    }>{call.outcome.replace('_', ' ')}</Badge>
                    <div className="text-[10px] text-slate-500 mt-0.5">{formatRelative(call.calledAt)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Tasks</CardTitle>
              <span className="text-xs text-slate-400">{(tasks ?? []).length} open</span>
            </CardHeader>
            <CardContent className="p-0">
              {(tasks ?? []).slice(0, 6).map(task => (
                <div key={task.id} className="flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-700/50 last:border-0">
                  <div className={`mt-0.5 size-2 rounded-full flex-shrink-0 ${
                    task.type === 'call' ? 'bg-blue-400' :
                    task.type === 'follow_up' ? 'bg-yellow-400' :
                    task.type === 'review_docs' ? 'bg-red-400' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{task.body}</div>
                    <div className="text-[10px] text-slate-400">{formatDate(task.dueAt)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
