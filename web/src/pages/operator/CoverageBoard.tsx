import { useState } from 'react';
import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface BoardRow {
  routeOccurrenceId: string;
  routeCode: string;
  routeName: string;
  criticality: string;
  scheduledStart: string;
  status: string;
  assignments: Array<{ id: string; type: string; status: string; driverName: string; tier: string; t24Status: string }>;
  backupPrepared: boolean;
  recoveryOpen: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CoverageBoard() {
  const [date, setDate] = useState(todayIso());
  const { data, error, loading } = useApiGet<BoardRow[]>(`/operator/coverage-board?date=${date}`, [date]);

  return (
    <div>
      <h1>Coverage Board</h1>
      <div className="subtitle">Every route occurrence for the selected day, with live commitment-risk tiers.</div>
      <div className="filters">
        <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data && (
        <div className="card">
          {data.length === 0 ? (
            <div className="empty-state">No route occurrences scheduled for this date.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Route</th><th>Criticality</th><th>Start</th><th>Status</th><th>Assignments</th><th>Backup</th><th>Recovery</th></tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.routeOccurrenceId}>
                    <td>{row.routeCode} — {row.routeName}</td>
                    <td><Badge value={row.criticality} /></td>
                    <td>{new Date(row.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td><Badge value={row.status} className="neutral" /></td>
                    <td className="pill-row">
                      {row.assignments.length === 0 ? (
                        <span style={{ color: '#6b7280' }}>No assignment</span>
                      ) : (
                        row.assignments.map((a) => <Badge key={a.id} value={`${a.driverName} (${a.type})`} className={a.tier} />)
                      )}
                    </td>
                    <td>{row.backupPrepared ? <Badge value="Prepared" className="GREEN" /> : <Badge value="None" className="neutral" />}</td>
                    <td>{row.recoveryOpen ? <Badge value="Open" className="RED" /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
