import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApiGet } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Badge } from '../../components/Badge.js';

interface RouteInfo {
  id: string;
  routeCode: string;
  routeName: string;
  pickupArea: string;
  deliveryArea: string;
  criticality: string;
  scheduledStart: string;
  estimatedCompletion: string;
  materialNotes: string | null;
}

interface Occurrence {
  id: string;
  serviceDate: string;
  scheduledStart: string;
  status: string;
  assignments: Array<{ id: string; assignmentType: string; status: string; driverId: string; commitmentRiskTier: string }>;
}

interface Driver {
  id: string;
  name: string;
}

export default function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const routeQ = useApiGet<RouteInfo>(`/operator/routes/${id}`);
  const occQ = useApiGet<Occurrence[]>(`/operator/routes/${id}/occurrences`);
  const driversQ = useApiGet<Driver[]>('/operator/drivers');
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function offer(occurrenceId: string, assignmentType: 'PRIMARY' | 'BACKUP') {
    const driverId = selectedDriver[occurrenceId];
    if (!driverId) return;
    setBusy(occurrenceId);
    setNotice(null);
    try {
      await api.post('/operator/assignments/offer', { routeOccurrenceId: occurrenceId, driverId, assignmentType });
      setNotice('Offer sent.');
      occQ.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to send offer');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1>{routeQ.data?.routeCode} — {routeQ.data?.routeName}</h1>
      <div className="subtitle">{routeQ.data?.pickupArea} → {routeQ.data?.deliveryArea} · {routeQ.data?.scheduledStart}–{routeQ.data?.estimatedCompletion}</div>
      {routeQ.error && <div className="error-banner">{routeQ.error}</div>}
      {notice && <div className="card">{notice}</div>}

      {routeQ.data && (
        <div className="card">
          <h2>Route details</h2>
          <table>
            <tbody>
              <tr><td>Criticality</td><td><Badge value={routeQ.data.criticality} /></td></tr>
              {routeQ.data.materialNotes && <tr><td>Material notes</td><td>{routeQ.data.materialNotes}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Occurrences</h2>
        {occQ.error && <div className="error-banner">{occQ.error}</div>}
        {occQ.data && (
          <table>
            <thead>
              <tr><th>Service date</th><th>Status</th><th>Assignments</th><th>Assign a driver</th></tr>
            </thead>
            <tbody>
              {occQ.data.map((o) => (
                <tr key={o.id}>
                  <td>{o.serviceDate}</td>
                  <td><Badge value={o.status} className="neutral" /></td>
                  <td className="pill-row">
                    {o.assignments.length === 0 ? '—' : o.assignments.map((a) => (
                      <Badge key={a.id} value={`${a.assignmentType}: ${a.status}`} className={a.commitmentRiskTier} />
                    ))}
                  </td>
                  <td>
                    <select value={selectedDriver[o.id] ?? ''} onChange={(e) => setSelectedDriver((s) => ({ ...s, [o.id]: e.target.value }))}>
                      <option value="">Select driver…</option>
                      {driversQ.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>{' '}
                    <button className="btn secondary" disabled={busy === o.id} onClick={() => offer(o.id, 'PRIMARY')}>Offer primary</button>{' '}
                    <button className="btn secondary" disabled={busy === o.id} onClick={() => offer(o.id, 'BACKUP')}>Offer backup</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
