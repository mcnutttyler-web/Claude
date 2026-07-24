import { useApiGet } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Badge } from '../../components/Badge.js';

interface RecoveryRow {
  id: string;
  routeCode: string;
  routeName: string;
  criticality: string;
  serviceDate: string;
  scheduledStart: string;
  status: string;
  trigger: string;
  candidates: Array<{ id: string; driverId: string; status: string }>;
  elapsedSeconds: number;
}

function fmtElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function RecoveryQueue() {
  const { data, error, loading, reload } = useApiGet<RecoveryRow[]>('/operator/recovery-queue');

  async function markUnresolved(id: string) {
    await api.post(`/operator/recovery-cases/${id}/unresolved`);
    reload();
  }

  return (
    <div>
      <h1>Recovery Queue</h1>
      <div className="subtitle">Route occurrences without secured coverage. Sorted by how long they&apos;ve been open.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      <div className="card">
        {data && data.length === 0 && <div className="empty-state">Nothing in recovery right now.</div>}
        {data && data.length > 0 && (
          <table>
            <thead>
              <tr><th>Route</th><th>Criticality</th><th>Service date</th><th>Status</th><th>Trigger</th><th>Candidates</th><th>Elapsed</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.routeCode} — {r.routeName}</td>
                  <td><Badge value={r.criticality} /></td>
                  <td>{r.serviceDate}</td>
                  <td><Badge value={r.status} className="ORANGE" /></td>
                  <td>{r.trigger}</td>
                  <td>{r.candidates.length}</td>
                  <td>{fmtElapsed(r.elapsedSeconds)}</td>
                  <td><button className="btn secondary" onClick={() => markUnresolved(r.id)}>Mark unresolved</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
