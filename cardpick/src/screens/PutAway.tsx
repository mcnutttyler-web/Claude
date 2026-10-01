import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createLocation, nextChaosCode } from '../db/inventory';
import { endPutaway, putawayTap, putawayUndo, startSession } from '../db/sessions';
import { activeMs, formatDuration } from '../domain/metrics';
import { shortVariant } from '../domain/tcgplayer';
import type { AuditSession } from '../domain/types';
import { CardLabel, CardSearch, LocationPicker, Meter, Screen } from '../ui/components';
import { useToast } from '../ui/toast';
import { buzz, errMsg, useItemMap, useItems, useMeta } from '../ui/util';
import { useLocationCounts } from './shared';

export function PutAwayScreen({ go }: { go: (r: string) => void }) {
  const toast = useToast();
  const locations = useLiveQuery(() => db().locations.toArray(), []) ?? [];
  const counts = useLocationCounts();
  const open = useLiveQuery(() => db().sessions.where('mode').equals('putaway').filter((s) => s.endedAt === null).toArray(), []);
  const last = useMeta<string | null>('lastLocation:putaway', null);
  const [choosing, setChoosing] = useState(false);
  const items = useItems();

  // The most recent open session is the current one: no need to pick the bin again.
  const session = choosing ? undefined : open?.sort((a, b) => b.startedAt - a.startedAt)[0];

  const start = async (code: string) => {
    try {
      // Only one put-away bin at a time: close others so the location stays obvious.
      for (const s of open ?? []) if (s.location !== code) await endPutaway(s.id);
      await startSession(code, 'putaway');
      setChoosing(false);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const newChaos = async () => {
    try {
      const code = await nextChaosCode();
      await createLocation(code, 'chaos');
      toast(`Created ${code}`);
      await start(code);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  if (!items?.length) {
    return (
      <Screen title="Put Away">
        <div className="panel">
          <p>Import your TCGplayer inventory first so cards can be found by name.</p>
          <button className="btn btn-primary btn-wide" onClick={() => go('import')}>
            Import TCGplayer inventory
          </button>
        </div>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen title="Put Away">
        <p className="hint">Choose the bin you are filling. CardPick remembers it until you switch.</p>
        {last && locations.some((l) => l.code === last && !l.retired) && (
          <button className="btn btn-primary btn-wide" onClick={() => void start(last)}>
            Continue {last}
          </button>
        )}
        <LocationPicker
          locations={locations}
          kinds={['chaos', 'sorted']}
          onChange={(c) => void start(c)}
          counts={counts}
          extra={
            <button className="loc-btn loc-new" onClick={() => void newChaos()}>
              <strong>+ New chaos bin</strong>
            </button>
          }
        />
      </Screen>
    );
  }

  return <ActivePutAway session={session} count={counts.get(session.location) ?? 0} onSwitch={() => setChoosing(true)} onNewBin={() => void newChaos()} />;
}

function ActivePutAway({ session, count, onSwitch, onNewBin }: { session: AuditSession; count: number; onSwitch: () => void; onNewBin: () => void }) {
  const toast = useToast();
  const items = useItems() ?? [];
  const byId = useItemMap();
  const loc = useLiveQuery(() => db().locations.get(session.location), [session.location]);
  const placed = session.lines.reduce((a, l) => a + l.qty, 0);
  const full = loc?.capacity ? count >= loc.capacity : false;

  const tap = async (itemId: string) => {
    try {
      await putawayTap(session.id, itemId);
      buzz();
      const it = byId.get(itemId);
      if (it) toast(`${session.location} ← ${it.productName} ${shortVariant(it)}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const undo = async (itemId: string) => {
    try {
      await putawayUndo(session.id, itemId);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Screen
      title={`Into ${session.location}`}
      right={
        <button className="btn btn-small" onClick={onSwitch}>
          Switch bin
        </button>
      }
    >
      <div className="session-bar">
        <span>
          <strong data-testid="putaway-count">{placed}</strong> placed now
        </span>
        <span>
          {count}
          {loc?.capacity ? ` / ${loc.capacity}` : ''} in bin
        </span>
        <span>{formatDuration(activeMs(session.taps))}</span>
      </div>
      {loc?.capacity ? <Meter value={count} max={loc.capacity} /> : null}
      {full && (
        <div className="panel panel-warn">
          {session.location} has reached its target of {loc?.capacity} cards.{' '}
          <button className="btn btn-small" onClick={onNewBin}>
            Start next bin
          </button>
        </div>
      )}
      <CardSearch items={items} allowUnlisted onPick={(it) => tap(it.id)} note={(i) => (session.lines.find((l) => l.itemId === i.id) ? `+${session.lines.find((l) => l.itemId === i.id)!.qty}` : null)} />
      <ul className="lines">
        {session.lines.map((l) => {
          const it = byId.get(l.itemId);
          return (
            <li key={l.itemId} className="line">
              {it ? <CardLabel item={it} /> : <span>{l.itemId}</span>}
              <div className="qty-ctl">
                <button className="btn btn-qty" aria-label="take one out" onClick={() => void undo(l.itemId)}>
                  −
                </button>
                <span className="qty">{l.qty}</span>
                <button className="btn btn-qty" aria-label="one more" onClick={() => void tap(l.itemId)}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
