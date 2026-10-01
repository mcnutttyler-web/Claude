import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { auditTap, discardAudit, finishAudit, previewAudit, startSession, type AuditPreview } from '../db/sessions';
import { formatDuration, perHour, activeMs } from '../domain/metrics';
import type { AuditResult, AuditSession } from '../domain/types';
import { CardLabel, CardSearch, ConfirmButton, LocationPicker, Screen } from '../ui/components';
import { useToast } from '../ui/toast';
import { buzz, errMsg, useItemMap, useItems, useMeta } from '../ui/util';
import { useLocationCounts } from './shared';
import { shortVariant } from '../domain/tcgplayer';

export function AuditScreen({ go }: { go: (r: string) => void }) {
  const toast = useToast();
  const locations = useLiveQuery(() => db().locations.toArray(), []) ?? [];
  const counts = useLocationCounts();
  const open = useLiveQuery(() => db().sessions.where('mode').equals('audit').filter((s) => s.endedAt === null).toArray(), []);
  const last = useMeta<string | null>('lastLocation:audit', null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: AuditResult; loc: string } | null>(null);
  const items = useItems();

  const session = open?.find((s) => s.id === sessionId) ?? (sessionId === null && open?.length === 1 ? open[0] : undefined);

  if (!items?.length) {
    return (
      <Screen title="Audit">
        <div className="panel">
          <p>Start by importing your TCGplayer inventory export so CardPick knows your cards.</p>
          <button className="btn btn-primary btn-wide" onClick={() => go('import')}>
            Import TCGplayer inventory
          </button>
        </div>
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen title="Audit done">
        <AuditResultCard r={result.r} location={result.loc} />
        <button className="btn btn-primary btn-wide" onClick={() => setResult(null)}>
          Audit another location
        </button>
        <button className="btn btn-wide" onClick={() => go('stats')}>
          See experiment progress
        </button>
      </Screen>
    );
  }

  if (!session) {
    const start = async (code: string) => {
      try {
        const s = await startSession(code, 'audit');
        setSessionId(s.id);
      } catch (e) {
        toast(errMsg(e), 'error');
      }
    };
    const auditable = locations.filter((l) => l.kind !== 'system' && !l.retired);
    return (
      <Screen title="Audit">
        <p className="hint">Count what is physically in one location. Nothing changes until you finish.</p>
        {open && open.length > 0 && (
          <div className="panel">
            <h2>Unfinished audits</h2>
            {open.map((s) => (
              <button key={s.id} className="btn btn-wide" onClick={() => setSessionId(s.id)}>
                Resume {s.location} · {s.lines.reduce((a, l) => a + l.qty, 0)} cards counted
              </button>
            ))}
          </div>
        )}
        {last && auditable.some((l) => l.code === last) && (
          <button className="btn btn-primary btn-wide" onClick={() => void start(last)}>
            Audit {last} again
          </button>
        )}
        {auditable.length ? (
          <LocationPicker locations={locations} kinds={['sorted', 'chaos']} onChange={(c) => void start(c)} counts={counts} />
        ) : (
          <div className="panel">
            <p>Create the boxes/locations you want to audit first.</p>
            <button className="btn btn-primary btn-wide" onClick={() => go('locations')}>
              Set up locations
            </button>
          </div>
        )}
      </Screen>
    );
  }

  return <ActiveAudit session={session} onDone={(r) => setResult({ r, loc: session.location })} onExit={() => setSessionId(null)} />;
}

function ActiveAudit({ session, onDone, onExit }: { session: AuditSession; onDone: (r: AuditResult) => void; onExit: () => void }) {
  const toast = useToast();
  const items = useItems() ?? [];
  const byId = useItemMap();
  const loc = useLiveQuery(() => db().locations.get(session.location), [session.location]);
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [opts, setOpts] = useState({ markNotCountedMissing: false, confirmHomeAbsent: false });
  const counted = session.lines.reduce((a, l) => a + l.qty, 0);
  const qtyHere = new Map(session.lines.map((l) => [l.itemId, l.qty]));
  // Speed is noise until enough cards are counted.
  const rate = session.taps.length >= 10 ? perHour(session.taps.length, activeMs(session.taps)) : null;

  const tap = async (itemId: string, delta: number) => {
    try {
      await auditTap(session.id, itemId, delta);
      if (delta > 0) {
        buzz();
        const it = byId.get(itemId);
        if (it) toast(`+1 ${it.productName} ${shortVariant(it)}`);
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  if (preview) {
    const finish = async () => {
      try {
        onDone(await finishAudit(session.id, opts));
      } catch (e) {
        toast(errMsg(e), 'error');
      }
    };
    return (
      <Screen title={`Finish ${session.location}`}>
        <div className="panel">
          <p>
            <strong>{counted}</strong> cards · <strong>{session.lines.length}</strong> different cards counted.
          </p>
        </div>
        {preview.homeAbsent.length > 0 && (
          <div className="panel">
            <h2>Listed on TCGplayer, not counted here ({preview.homeAbsent.length})</h2>
            <p className="hint">
              These are from {loc?.setHomes.join(', ')}, which lives in {session.location}. If you counted the whole set, they are not here.
            </p>
            <ul className="mini-list">
              {preview.homeAbsent.slice(0, 30).map((i) => (
                <li key={i.id}>
                  <CardLabel item={i} sub={false} /> <small>TCG {i.marketplaceQty}</small>
                </li>
              ))}
              {preview.homeAbsent.length > 30 && <li className="sub">…and {preview.homeAbsent.length - 30} more</li>}
            </ul>
            <label className="toggle">
              <input type="checkbox" checked={opts.confirmHomeAbsent} onChange={(e) => setOpts({ ...opts, confirmHomeAbsent: e.target.checked })} />I
              counted the whole set — record these as not here (0)
            </label>
          </div>
        )}
        {preview.notCounted.length > 0 && (
          <div className="panel">
            <h2>Previously recorded here, not counted ({preview.notCounted.length})</h2>
            <ul className="mini-list">
              {preview.notCounted.map((n) => (
                <li key={n.item.id}>
                  <CardLabel item={n.item} sub={false} /> ×{n.qty}
                </li>
              ))}
            </ul>
            <label className="toggle">
              <input type="checkbox" checked={opts.markNotCountedMissing} onChange={(e) => setOpts({ ...opts, markNotCountedMissing: e.target.checked })} />
              They are not here — move to Missing for investigation
            </label>
            <p className="hint">Leave unchecked if you only audited part of this location.</p>
          </div>
        )}
        <div className="thumb-bar">
          <button className="btn" onClick={() => setPreview(null)}>
            Back
          </button>
          <button className="btn btn-primary" onClick={() => void finish()}>
            Save counts
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title={`Auditing ${session.location}`}
      right={
        <button className="btn btn-small" onClick={onExit}>
          Switch
        </button>
      }
    >
      <div className="session-bar">
        <span>
          <strong data-testid="audit-count">{counted}</strong> cards
        </span>
        <span>{session.lines.length} different</span>
        <span>{rate ? `${Math.round(rate)}/hr` : '—'}</span>
      </div>
      <CardSearch
        items={items}
        preferredSets={loc?.setHomes}
        allowUnlisted
        note={(i) => (qtyHere.get(i.id) ? `${qtyHere.get(i.id)} counted` : null)}
        onPick={(it) => tap(it.id, 1)}
      />
      <ul className="lines">
        {session.lines.map((l) => {
          const it = byId.get(l.itemId);
          return (
            <li key={l.itemId} className="line">
              {it ? <CardLabel item={it} /> : <span>{l.itemId}</span>}
              <div className="qty-ctl">
                <button className="btn btn-qty" aria-label="minus one" onClick={() => void tap(l.itemId, -1)}>
                  −
                </button>
                <span className="qty">{l.qty}</span>
                <button className="btn btn-qty" aria-label="plus one" onClick={() => void tap(l.itemId, 1)}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="thumb-bar">
        <ConfirmButton
          className="btn"
          onConfirm={async () => {
            await discardAudit(session.id);
            onExit();
          }}
        >
          Discard
        </ConfirmButton>
        <button
          className="btn btn-primary"
          disabled={!session.lines.length}
          onClick={async () => {
            try {
              setPreview(await previewAudit(session.id));
            } catch (e) {
              toast(errMsg(e), 'error');
            }
          }}
        >
          Finish {session.location}
        </button>
      </div>
    </Screen>
  );
}

export function AuditResultCard({ r, location }: { r: AuditResult; location: string }) {
  return (
    <div className="panel">
      <h2>{location} counted</h2>
      <dl className="stats">
        <dt>Cards counted</dt>
        <dd>{r.cardsCounted}</dd>
        <dt>Different cards</dt>
        <dd>{r.skusCounted}</dd>
        <dt>Disagree with TCGplayer</dt>
        <dd>{r.discrepancies}</dd>
        {r.confirmedAbsent > 0 && (
          <>
            <dt>Confirmed not here</dt>
            <dd>{r.confirmedAbsent}</dd>
          </>
        )}
        {r.movedToMissing > 0 && (
          <>
            <dt>Moved to Missing</dt>
            <dd>{r.movedToMissing}</dd>
          </>
        )}
        {r.pending > 0 && (
          <>
            <dt>Waiting on other boxes</dt>
            <dd>{r.pending}</dd>
          </>
        )}
        <dt>Active time</dt>
        <dd>{formatDuration(r.activeMs)}</dd>
        <dt>Speed</dt>
        <dd>{perHour(r.cardsCounted, r.activeMs) ? `${Math.round(perHour(r.cardsCounted, r.activeMs)!)} cards/hr` : '—'}</dd>
      </dl>
    </div>
  );
}
