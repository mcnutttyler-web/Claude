import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface ExceptionRow {
  routeOccurrenceId: string;
  routeCode: string;
  routeName: string;
  serviceDate: string;
  commitmentState: string;
  stateReason: string;
}

export default function ShipperExceptions() {
  const { data, error, loading } = useApiGet<ExceptionRow[]>('/shipper/exceptions');

  return (
    <div>
      <h1>Exceptions</h1>
      <div className="subtitle">Routes needing attention — offers not yet accepted, or active operator intervention.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      <div className="card">
        {data && data.length === 0 && <div className="empty-state">No exceptions right now.</div>}
        {data && data.length > 0 && (
          <table>
            <thead><tr><th>Route</th><th>Service date</th><th>State</th><th>Reason</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.routeOccurrenceId}>
                  <td>{r.routeCode} — {r.routeName}</td>
                  <td>{r.serviceDate}</td>
                  <td><Badge value={r.commitmentState} className={r.commitmentState === 'INTERVENTION_UNDERWAY' ? 'ORANGE' : 'neutral'} /></td>
                  <td>{r.stateReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
