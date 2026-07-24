import { useState } from 'react';
import { useApiGet } from '../../hooks/useApi.js';

interface Metrics {
  committedDriverRetentionRate: number | null;
  originalDriverStartRate: number | null;
  avoidableCancellationRate: number | null;
  unavoidableCancellationRate: number | null;
  namedBackupCoverageRate: number | null;
  backupActivationRate: number | null;
  medianRecoveryTimeSeconds: number | null;
  routesRequiringEmergencyReplacement: number;
  onTimePickupRate: number | null;
  routeCompletionRate: number | null;
  recurringDriverRetentionRate: number | null;
  fullDisclosureAcceptanceRate: number | null;
  sampleSize: { occurrences: number; primaryAssignments: number };
}

function pct(v: number | null) {
  return v === null ? '—' : `${v}%`;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default function Reports() {
  const [start, setStart] = useState(isoDaysAgo(30));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const { data, error, loading } = useApiGet<Metrics>(`/operator/metrics?start=${start}&end=${end}`, [start, end]);

  return (
    <div>
      <h1>Reports</h1>
      <div className="subtitle">Reliability metrics for shipper reporting. Committed-driver retention is the primary metric.</div>
      <div className="filters">
        <label>Start <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>End <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading...</div>}
      {data && (
        <>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{pct(data.committedDriverRetentionRate)}</div><div className="label">Committed-driver retention</div></div>
            <div className="stat-tile"><div className="value">{pct(data.originalDriverStartRate)}</div><div className="label">Original-driver start rate</div></div>
            <div className="stat-tile"><div className="value">{pct(data.avoidableCancellationRate)}</div><div className="label">Avoidable cancellation rate</div></div>
            <div className="stat-tile"><div className="value">{pct(data.unavoidableCancellationRate)}</div><div className="label">Unavoidable cancellation rate</div></div>
            <div className="stat-tile"><div className="value">{pct(data.namedBackupCoverageRate)}</div><div className="label">Named-backup coverage</div></div>
            <div className="stat-tile"><div className="value">{pct(data.backupActivationRate)}</div><div className="label">Backup activation rate</div></div>
            <div className="stat-tile"><div className="value">{data.medianRecoveryTimeSeconds ? Math.round(data.medianRecoveryTimeSeconds / 60) + 'm' : '—'}</div><div className="label">Median recovery time</div></div>
            <div className="stat-tile"><div className="value">{data.routesRequiringEmergencyReplacement}</div><div className="label">Emergency replacements</div></div>
            <div className="stat-tile"><div className="value">{pct(data.onTimePickupRate)}</div><div className="label">On-time pickup rate</div></div>
            <div className="stat-tile"><div className="value">{pct(data.routeCompletionRate)}</div><div className="label">Route completion rate</div></div>
            <div className="stat-tile"><div className="value">{pct(data.recurringDriverRetentionRate)}</div><div className="label">Recurring-driver retention</div></div>
            <div className="stat-tile"><div className="value">{pct(data.fullDisclosureAcceptanceRate)}</div><div className="label">Full-disclosure acceptance</div></div>
          </div>
          <div className="card">
            Sample: {data.sampleSize.occurrences} occurrences, {data.sampleSize.primaryAssignments} primary assignments.
          </div>
        </>
      )}
    </div>
  );
}
