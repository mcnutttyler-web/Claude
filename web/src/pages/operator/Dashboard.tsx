import { Link } from 'react-router-dom';
import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface DashboardData {
  routesToday: number;
  orangeOrRedCount: number;
  uncoveredCount: number;
  openRecoveryCases: number;
  exceptions: Array<{
    routeOccurrenceId: string;
    routeCode: string;
    routeName: string;
    serviceDate: string;
    status: string;
    tiers: Array<{ assignmentId: string; tier: string; type: string }>;
  }>;
}

export default function Dashboard() {
  const { data, error, loading } = useApiGet<DashboardData>('/operator/dashboard');

  return (
    <div>
      <h1>Operations Dashboard</h1>
      <div className="subtitle">Exception-focused view of today&apos;s reliability posture.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data && (
        <>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{data.routesToday}</div><div className="label">Routes today</div></div>
            <div className="stat-tile"><div className="value">{data.orangeOrRedCount}</div><div className="label">Orange / Red assignments</div></div>
            <div className="stat-tile"><div className="value">{data.uncoveredCount}</div><div className="label">Uncovered occurrences</div></div>
            <div className="stat-tile"><div className="value">{data.openRecoveryCases}</div><div className="label">Open recovery cases</div></div>
          </div>
          <div className="card">
            <h2>Today&apos;s exceptions</h2>
            {data.exceptions.length === 0 ? (
              <div className="empty-state">No orange or red assignments today. Nothing needs attention.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Route</th><th>Service date</th><th>Status</th><th>Tiers</th><th></th></tr>
                </thead>
                <tbody>
                  {data.exceptions.map((e) => (
                    <tr key={e.routeOccurrenceId}>
                      <td>{e.routeCode} — {e.routeName}</td>
                      <td>{e.serviceDate}</td>
                      <td><Badge value={e.status} className="neutral" /></td>
                      <td className="pill-row">
                        {e.tiers.map((t) => (
                          <Badge key={t.assignmentId} value={`${t.type}: ${t.tier}`} className={t.tier} />
                        ))}
                      </td>
                      <td><Link to={`/operator/recovery-queue`}>Recovery Queue →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
