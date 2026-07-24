import { Link } from 'react-router-dom';
import { useApiGet } from '../../hooks/useApi.js';
import { Badge } from '../../components/Badge.js';

interface RouteRow {
  id: string;
  routeCode: string;
  routeName: string;
  pickupArea: string;
  deliveryArea: string;
  criticality: string;
  scheduledStart: string;
}

export default function RoutesList() {
  const { data, error, loading } = useApiGet<RouteRow[]>('/operator/routes');

  return (
    <div>
      <h1>Routes</h1>
      <div className="subtitle">Recurring operating templates. Select a route to manage occurrences and ownership.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Pickup → Delivery</th><th>Criticality</th><th>Start</th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/operator/routes/${r.id}`}>{r.routeCode}</Link></td>
                  <td>{r.routeName}</td>
                  <td>{r.pickupArea} → {r.deliveryArea}</td>
                  <td><Badge value={r.criticality} /></td>
                  <td>{r.scheduledStart}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
