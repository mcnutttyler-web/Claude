import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface CancellationRow {
  id: string;
  classification: string;
  category: string;
  structuredReason: string;
  minutesBeforeStart: number | null;
  eventTimestamp: string;
  assignment: {
    driver: { name: string };
    routeOccurrence: { serviceDate: string; route: { routeCode: string; routeName: string } };
  };
}

export default function Cancellations() {
  const { data, error, loading } = useApiGet<CancellationRow[]>('/operator/cancellations');

  return (
    <div>
      <h1>Cancellations</h1>
      <div className="subtitle">Reason-coded cancellation log. Raw reasons stay operator-private and never reach the shipper view.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      <div className="card">
        {data && data.length === 0 && <div className="empty-state">No cancellations recorded.</div>}
        {data && data.length > 0 && (
          <table>
            <thead>
              <tr><th>Route</th><th>Driver</th><th>Service date</th><th>Classification</th><th>Category</th><th>Reason</th><th>Min. before start</th></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{c.assignment.routeOccurrence.route.routeCode} — {c.assignment.routeOccurrence.route.routeName}</td>
                  <td>{c.assignment.driver.name}</td>
                  <td>{c.assignment.routeOccurrence.serviceDate}</td>
                  <td><Badge value={c.classification} className={c.classification === 'AVOIDABLE' ? 'RED' : 'neutral'} /></td>
                  <td>{c.category}</td>
                  <td>{c.structuredReason}</td>
                  <td>{c.minutesBeforeStart ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
