import { useApiGet } from '../../hooks/useApi.js';

interface Program {
  id: string;
  name: string;
  type: string;
  amount: number | null;
  activeStatus: boolean;
}

interface LedgerEntry {
  id: string;
  status: string;
  amount: number | null;
  settlementExportStatus: string;
  driver: { name: string };
  program: { name: string };
}

export default function Incentives() {
  const programsQ = useApiGet<Program[]>('/operator/incentive-programs');
  const ledgerQ = useApiGet<LedgerEntry[]>('/operator/incentive-ledger');

  return (
    <div>
      <h1>Incentives</h1>
      <div className="subtitle">RoutePilot tracks backup and standby incentives; your settlement system handles actual payment.</div>

      <div className="card">
        <h2>Programs</h2>
        {programsQ.data && (
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Amount</th><th>Active</th></tr></thead>
            <tbody>
              {programsQ.data.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td>{p.type}</td><td>{p.amount ?? '—'}</td><td>{p.activeStatus ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Ledger</h2>
        {ledgerQ.data && (
          <table>
            <thead><tr><th>Driver</th><th>Program</th><th>Status</th><th>Amount</th><th>Settlement export</th></tr></thead>
            <tbody>
              {ledgerQ.data.map((e) => (
                <tr key={e.id}><td>{e.driver.name}</td><td>{e.program.name}</td><td>{e.status}</td><td>{e.amount ?? '—'}</td><td>{e.settlementExportStatus}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
