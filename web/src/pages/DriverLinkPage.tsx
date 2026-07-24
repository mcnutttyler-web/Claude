import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface LinkPayload {
  kind: 'ROUTE_OFFER' | 'CHECKPOINT' | 'BACKUP_OFFER' | 'INFO';
  driverName: string;
  assignmentId?: string;
  assignmentType?: string;
  assignmentStatus?: string;
  routeStreak?: number;
  acceptLanguage?: string;
  checkpointType?: string;
  backupArrangementId?: string;
  offer?: {
    operatorName?: string;
    routeCode: string;
    serviceDate: string;
    startTime?: string;
    estimatedEndTime?: string;
    pickupArea?: string;
    estimatedMileage?: number;
    stopCount?: number;
    vehicleRequirement?: string[];
    equipmentRequirement?: string[];
    commodity?: string;
    compensation?: Record<string, unknown>;
    materialNotes?: string;
    isBackupOrPrimary?: string;
    dispatcherContact?: string;
    availabilityWindow?: Record<string, unknown>;
    activationDeadline?: string;
    incentive?: Record<string, unknown>;
  } | null;
  message?: string;
}

export default function DriverLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LinkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/driver/link/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'This link is no longer valid.');
        setData(body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function respond(action: string) {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/driver/link/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not record your response.');
      setDone(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (loading && !data) return <div className="driver-link-page">Loading...</div>;
  if (error) return <div className="driver-link-page"><div className="card error-banner">{error}</div></div>;
  if (!data) return null;

  return (
    <div className="driver-link-page">
      <div className="card">
        <h2>Hi {data.driverName}</h2>

        {done ? (
          <p>Thanks — your response has been recorded ({done.replace(/_/g, ' ').toLowerCase()}).</p>
        ) : data.kind === 'ROUTE_OFFER' && data.offer ? (
          <>
            <p>
              <strong>{data.offer.operatorName}</strong> — Route {data.offer.routeCode} ({data.assignmentType?.toLowerCase()})
            </p>
            <table>
              <tbody>
                <tr><td>Service date</td><td>{data.offer.serviceDate}</td></tr>
                <tr><td>Start / est. end</td><td>{data.offer.startTime} – {data.offer.estimatedEndTime}</td></tr>
                <tr><td>Pickup area</td><td>{data.offer.pickupArea}</td></tr>
                <tr><td>Mileage / stops</td><td>{data.offer.estimatedMileage ?? '—'} mi / {data.offer.stopCount ?? '—'} stops</td></tr>
                <tr><td>Vehicle</td><td>{(data.offer.vehicleRequirement ?? []).join(', ') || '—'}</td></tr>
                <tr><td>Equipment</td><td>{(data.offer.equipmentRequirement ?? []).join(', ') || '—'}</td></tr>
                <tr><td>Commodity</td><td>{data.offer.commodity || '—'}</td></tr>
                <tr><td>Compensation</td><td>{JSON.stringify(data.offer.compensation)}</td></tr>
                {data.offer.materialNotes && <tr><td>Notes</td><td>{data.offer.materialNotes}</td></tr>}
                <tr><td>Dispatcher contact</td><td>{data.offer.dispatcherContact}</td></tr>
              </tbody>
            </table>
            {typeof data.routeStreak === 'number' && data.routeStreak > 0 && (
              <p style={{ fontSize: 12, color: '#6b7280' }}>Route streak: {data.routeStreak} weeks. Your route streak and reliability standing mean fewer check-ins.</p>
            )}
            <p style={{ fontStyle: 'italic', fontSize: 13 }}>&ldquo;{data.acceptLanguage}&rdquo;</p>
            <button className="btn accept-btn" onClick={() => respond('ACCEPT')} disabled={loading}>I reviewed the route details and want this route</button>
            <button className="btn secondary accept-btn" onClick={() => respond('DECLINE')} disabled={loading}>Decline this route</button>
          </>
        ) : data.kind === 'CHECKPOINT' ? (
          <>
            <p>Quick check-in for your upcoming route.</p>
            <button className="btn accept-btn" onClick={() => respond('ON_MY_WAY')} disabled={loading}>On my way / all set</button>
            <button className="btn secondary accept-btn" onClick={() => respond('RUNNING_LATE')} disabled={loading}>Running late</button>
            <button className="btn secondary accept-btn" onClick={() => respond('PROBLEM')} disabled={loading}>Problem with route</button>
            <button className="btn secondary accept-btn" onClick={() => respond('CANNOT_COMPLETE')} disabled={loading}>Cannot complete</button>
          </>
        ) : data.kind === 'BACKUP_OFFER' && data.offer ? (
          <>
            <p>Backup opportunity — Route {data.offer.routeCode} on {data.offer.serviceDate}.</p>
            <table>
              <tbody>
                <tr><td>Availability window</td><td>{JSON.stringify(data.offer.availabilityWindow)}</td></tr>
                <tr><td>Activation deadline</td><td>{data.offer.activationDeadline}</td></tr>
                <tr><td>Incentive</td><td>{JSON.stringify(data.offer.incentive)}</td></tr>
              </tbody>
            </table>
            <button className="btn accept-btn" onClick={() => respond('ACCEPT')} disabled={loading}>Accept backup</button>
            <button className="btn secondary accept-btn" onClick={() => respond('INTERESTED_FUTURE')} disabled={loading}>Interested in future dates</button>
            <button className="btn secondary accept-btn" onClick={() => respond('UNAVAILABLE_TODAY')} disabled={loading}>Unavailable today</button>
            <button className="btn secondary accept-btn" onClick={() => respond('DECLINE')} disabled={loading}>Decline</button>
          </>
        ) : (
          <p>{data.message || 'No action needed.'}</p>
        )}
      </div>
    </div>
  );
}
