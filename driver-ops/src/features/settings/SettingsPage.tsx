import { TopBar } from '@/components/layout/TopBar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/services/db'

export function SettingsPage() {
  const markets = useLiveQuery(() => db.markets.toArray(), [])
  const users = useLiveQuery(() => db.users.toArray(), [])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Settings" />
      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-3xl">
        <Card>
          <CardHeader><CardTitle>Markets</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(markets ?? []).map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-100">{m.name}</div>
                  <div className="text-xs text-slate-400">{m.region} · {m.timezone}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${m.active ? 'bg-green-900 text-green-200' : 'bg-slate-700 text-slate-400'}`}>
                  {m.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Users</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(users ?? []).map(u => (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-100">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </div>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{u.role}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-slate-400">
              {['Monday.com', 'Intercom', 'Twilio (SMS)', 'Google Calendar', 'Google Sheets'].map(name => (
                <div key={name} className="flex items-center justify-between">
                  <span>{name}</span>
                  <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Coming soon</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
