import { useApiGet } from '../../hooks/useApi.js';

interface ShipperLink {
  id: string;
  contractReference: string | null;
  active: boolean;
  shipper: { id: string; name: string; pilotStatus: string };
}

export default function Shippers() {
  const { data, error, loading } = useApiGet<ShipperLink[]>('/operator/shippers');

  return (
    <div>
      <h1>Shippers</h1>
      <div className="subtitle">Shippers with a reliability-visibility relationship to your operation.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      <div className="card">
        {data && (
          <table>
            <thead><tr><th>Shipper</th><th>Contract ref.</th><th>Pilot status</th><th>Active</th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <td>{l.shipper.name}</td>
                  <td>{l.contractReference ?? '—'}</td>
                  <td>{l.shipper.pilotStatus}</td>
                  <td>{l.active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
