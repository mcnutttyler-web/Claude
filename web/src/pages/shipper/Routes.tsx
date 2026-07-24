import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface ShipperRoute {
  routeOccurrenceId: string;
  routeCode: string;
  routeName: string;
  pickupArea: string;
  deliveryArea: string;
  criticality: string;
  serviceDate: string;
  commitmentState: string;
  stateReason: string;
  nextMilestone: string | null;
  shipperActionRequired: boolean;
}

export default function ShipperRoutes() {
  const { data, error, loading } = useApiGet<ShipperRoute[]>('/shipper/routes');

  return (
    <div>
      <h1>Routes</h1>
      <div className="subtitle">Routes your operator has made visible to you, with plain-language commitment status.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      <div className="card">
        {data && data.length === 0 && <div className="empty-state">No visible routes yet.</div>}
        {data && data.length > 0 && (
          <table>
            <thead><tr><th>Route</th><th>Criticality</th><th>Service date</th><th>Commitment state</th><th>Next milestone</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.routeOccurrenceId}>
                  <td>{r.routeCode} — {r.routeName}<br /><span style={{ fontSize: 12, color: '#6b7280' }}>{r.pickupArea} → {r.deliveryArea}</span></td>
                  <td><Badge value={r.criticality} /></td>
                  <td>{r.serviceDate}</td>
                  <td><Badge value={r.commitmentState} className="neutral" /><div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{r.stateReason}</div></td>
                  <td>{r.nextMilestone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
