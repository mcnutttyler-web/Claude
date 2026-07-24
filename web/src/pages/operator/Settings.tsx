import { useApiGet } from '../../hooks/useApi.js';

interface RuleVersion {
  id: string;
  version: string;
  active: boolean;
  createdAt: string;
  rules: Record<string, unknown>;
}

export default function Settings() {
  const { data, error, loading } = useApiGet<RuleVersion[]>('/operator/settings/risk-rules');

  return (
    <div>
      <h1>Settings</h1>
      <div className="subtitle">Configurable, versioned commitment-risk rules. Changes are audited and never expose a raw numeric score.</div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card">
        <h2>Risk rule versions</h2>
        {loading && <div className="empty-state">Loading...</div>}
        {data && data.length === 0 && <div className="empty-state">No custom rule versions yet — using platform defaults (v1).</div>}
        {data && data.length > 0 && (
          <table>
            <thead><tr><th>Version</th><th>Active</th><th>Created</th><th>Rules</th></tr></thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{v.active ? 'Yes' : 'No'}</td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                  <td><code style={{ fontSize: 11 }}>{JSON.stringify(v.rules)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
