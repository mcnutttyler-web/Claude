import { useState } from 'react';
import { useApiGet } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Badge } from '../../components/Badge.js';

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  timezone: string;
  smsConsentStatus: string;
  activeStatus: string;
}

export default function Drivers() {
  const { data, error, loading, reload } = useApiGet<DriverRow[]>('/operator/drivers');
  const [form, setForm] = useState({ name: '', phone: '' });
  const [creating, setCreating] = useState(false);

  async function createDriver(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/operator/drivers', form);
      setForm({ name: '', phone: '' });
      reload();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h1>Drivers</h1>
      <div className="subtitle">Operator-private driver roster and messaging consent status.</div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Add a driver</h2>
        <form onSubmit={createDriver} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block' }}>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required style={{ padding: 7 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block' }}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required style={{ padding: 7 }} />
          </div>
          <button className="btn" disabled={creating}>Add driver</button>
        </form>
      </div>

      <div className="card">
        {loading && <div className="empty-state">Loading...</div>}
        {data && (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Timezone</th><th>SMS consent</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.phone}</td>
                  <td>{d.timezone}</td>
                  <td><Badge value={d.smsConsentStatus} className={d.smsConsentStatus === 'OPTED_IN' ? 'GREEN' : d.smsConsentStatus === 'OPTED_OUT' ? 'RED' : 'neutral'} /></td>
                  <td>{d.activeStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
