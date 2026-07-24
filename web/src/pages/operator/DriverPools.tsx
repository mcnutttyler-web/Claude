import { useState } from 'react';
import { useApiGet } from '../../hooks/useApi.js';
import { api } from '../../api.js';

interface Pool {
  id: string;
  name: string;
  memberships: Array<{ driverId: string; status: string }>;
}

export default function DriverPools() {
  const { data, error, loading, reload } = useApiGet<Pool[]>('/operator/driver-pools');
  const [name, setName] = useState('');

  async function createPool(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/operator/driver-pools', { name });
    setName('');
    reload();
  }

  return (
    <div>
      <h1>Driver Pools</h1>
      <div className="subtitle">Operator-private pools (preferred, backup, trial, do-not-offer, etc). Never shared across operators.</div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Create a pool</h2>
        <form onSubmit={createPool} style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Pool name" value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: 7, flex: 1 }} />
          <button className="btn" disabled={!name}>Create</button>
        </form>
      </div>

      <div className="card">
        {loading && <div className="empty-state">Loading...</div>}
        {data && (
          <table>
            <thead><tr><th>Pool</th><th>Active members</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.memberships.filter((m) => m.status === 'ACTIVE').length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
