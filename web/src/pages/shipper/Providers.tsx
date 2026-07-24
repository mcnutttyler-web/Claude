import { useApiGet } from '../../hooks/useApi.js';

interface ProviderScorecard {
  operatorId: string;
  operatorName: string;
  metrics: {
    committedDriverRetentionRate: number | null;
    originalDriverStartRate: number | null;
    avoidableCancellationRate: number | null;
    unavoidableCancellationRate: number | null;
    namedBackupCoverageRate: number | null;
    backupActivationRate: number | null;
    medianRecoveryTimeSeconds: number | null;
    onTimePickupRate: number | null;
    routeCompletionRate: number | null;
    recurringDriverRetentionRate: number | null;
    fullDisclosureAcceptanceRate: number | null;
  };
}

function pct(v: number | null) {
  return v === null ? '—' : `${v}%`;
}

export default function ShipperProviders() {
  const { data, error, loading } = useApiGet<ProviderScorecard[]>('/shipper/providers');

  return (
    <div>
      <h1>Providers</h1>
      <div className="subtitle">Operator reliability scorecards (trailing 90 days). Use these to decide SLA, volume, and backup requirements.</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data?.map((p) => (
        <div className="card" key={p.operatorId}>
          <h2>{p.operatorName}</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{pct(p.metrics.committedDriverRetentionRate)}</div><div className="label">Committed-driver retention</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.originalDriverStartRate)}</div><div className="label">Original-driver start rate</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.avoidableCancellationRate)}</div><div className="label">Avoidable cancellation rate</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.unavoidableCancellationRate)}</div><div className="label">Unavoidable cancellation rate</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.namedBackupCoverageRate)}</div><div className="label">Named-backup coverage</div></div>
            <div className="stat-tile"><div className="value">{p.metrics.medianRecoveryTimeSeconds ? Math.round(p.metrics.medianRecoveryTimeSeconds / 60) + 'm' : '—'}</div><div className="label">Median recovery time</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.onTimePickupRate)}</div><div className="label">On-time pickup rate</div></div>
            <div className="stat-tile"><div className="value">{pct(p.metrics.recurringDriverRetentionRate)}</div><div className="label">Recurring-driver retention</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}
