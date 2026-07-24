import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface DashboardData {
  routesToday: number;
  stateCounts: Record<string, number>;
  operators: Array<{ operatorId: string; operatorName: string; metrics: { committedDriverRetentionRate: number | null; onTimePickupRate: number | null } }>;
}

export default function ShipperDashboard() {
  const { data, error, loading } = useApiGet<DashboardData>('/shipper/dashboard');

  return (
    <div>
      <h1>Reliability Dashboard</h1>
      <div className="subtitle">Your routes at a glance — commitment state only, never internal driver risk data.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data && (
        <>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{data.routesToday}</div><div className="label">Routes today</div></div>
            {Object.entries(data.stateCounts).map(([state, count]) => (
              <div className="stat-tile" key={state}>
                <div className="value">{count}</div>
                <div className="label"><Badge value={state} className="neutral" /></div>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Operator performance (trailing 30 days)</h2>
            <table>
              <thead><tr><th>Operator</th><th>Committed-driver retention</th><th>On-time pickup rate</th></tr></thead>
              <tbody>
                {data.operators.map((o) => (
                  <tr key={o.operatorId}>
                    <td>{o.operatorName}</td>
                    <td>{o.metrics.committedDriverRetentionRate ?? '—'}%</td>
                    <td>{o.metrics.onTimePickupRate ?? '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
