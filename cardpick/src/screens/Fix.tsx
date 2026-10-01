import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { checkIntegrity, confirmLost, markFound, type IntegrityReport } from '../db/inventory';
import { dismissProblem, linkOrderLine, linkUnlisted } from '../db/problems';
import type { Item, Location, Problem } from '../domain/types';
import { CardLabel, CardSearch, ConfirmButton, LocationPicker, Screen, Stepper } from '../ui/components';
import { useToast } from '../ui/toast';
import { errMsg, useItemMap, useItems } from '../ui/util';

const TITLES: Record<Problem['type'], string> = {
  missing: 'Missing cards',
  'pick-unverified': 'Not found where expected',
  unlisted: 'Not listed on TCGplayer',
  'order-line': 'Order lines to match',
  import: 'Import issues',
};
const ORDER: Problem['type'][] = ['missing', 'pick-unverified', 'order-line', 'unlisted', 'import'];

export function FixScreen() {
  const problems = useLiveQuery(() => db().problems.where('status').equals('open').toArray(), []) ?? [];
  const locations = useLiveQuery(() => db().locations.toArray(), []) ?? [];
  const items = useItemMap();
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const toast = useToast();

  return (
    <Screen
      title="Fix"
      right={
        <button
          className="btn btn-small"
          onClick={async () => {
            const r = await checkIntegrity();
            setIntegrity(r);
            toast(r.ok ? 'Inventory ledger checks out' : 'Integrity problems found', r.ok ? 'ok' : 'error');
          }}
        >
          Check data
        </button>
      }
    >
      {integrity && (
        <div className={`panel ${integrity.ok ? '' : 'panel-warn'}`}>
          {integrity.ok ? (
            <p>
              ✓ All {integrity.balances} balances match {integrity.ledgerEntries} ledger entries.
            </p>
          ) : (
            <>
              <p>Integrity problems — make a backup and report these:</p>
              <ul className="mini-list">
                {integrity.problems.slice(0, 20).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {problems.length === 0 && <p className="hint">Nothing to fix. 🎉</p>}
      {ORDER.map((type) => {
        const list = problems.filter((p) => p.type === type).sort((a, b) => a.createdAt - b.createdAt);
        if (!list.length) return null;
        return (
          <div key={type}>
            <h2 className="group-title">
              {TITLES[type]} ({list.length})
            </h2>
            {list.map((p) => (
              <ProblemCard key={p.id} p={p} item={p.itemId ? items.get(p.itemId) : undefined} locations={locations} />
            ))}
          </div>
        );
      })}
    </Screen>
  );
}

function ProblemCard({ p, item, locations }: { p: Problem; item: Item | undefined; locations: Location[] }) {
  const toast = useToast();
  const allItems = useItems() ?? [];
  const [mode, setMode] = useState<'none' | 'found' | 'link'>('none');
  const [qty, setQty] = useState(p.qty);
  const [loc, setLoc] = useState(p.location ?? '');
  const run = async (f: () => Promise<unknown>, msg: string) => {
    try {
      await f();
      toast(msg);
      setMode('none');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="panel problem" data-testid="problem">
      <div className="problem-head">
        {item ? <CardLabel item={item} /> : null}
        <strong>{p.message}</strong>
        <span className="sub">{p.detail}</span>
      </div>
      {p.type === 'missing' && mode === 'none' && (
        <div className="row">
          <button className="btn btn-primary" onClick={() => setMode('found')}>
            Found it
          </button>
          <ConfirmButton onConfirm={() => void run(() => confirmLost(p.id, p.qty), `Wrote off ${p.qty}`)}>Confirm lost ({p.qty})</ConfirmButton>
        </div>
      )}
      {p.type === 'missing' && mode === 'found' && (
        <div className="fewer">
          <span>How many, and where are they now?</span>
          {p.qty > 1 && <Stepper value={qty} min={1} max={p.qty} onChange={setQty} />}
          <LocationPicker locations={locations} kinds={['sorted', 'chaos']} value={loc} onChange={setLoc} />
          <div className="row">
            <button className="btn" onClick={() => setMode('none')}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!loc} onClick={() => void run(() => markFound(p.id, loc, qty), `Put ${qty} back in ${loc}`)}>
              Save
            </button>
          </div>
        </div>
      )}
      {(p.type === 'unlisted' || p.type === 'order-line') &&
        (mode === 'link' ? (
          <div>
            <p className="hint">{p.type === 'unlisted' ? 'Find the TCGplayer listing for this exact card (same set, number, condition, printing).' : 'Find the exact card this order line is for.'}</p>
            <CardSearch
              items={allItems}
              filter={(i) => !i.unlisted}
              onPick={(i) =>
                run(
                  () => (p.type === 'unlisted' ? linkUnlisted(p.id, i.id) : linkOrderLine(p.id, i.id)),
                  p.type === 'unlisted' ? 'Linked to TCGplayer listing' : 'Order line matched',
                )
              }
            />
            <button className="btn" onClick={() => setMode('none')}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-primary" onClick={() => setMode('link')}>
              {p.type === 'unlisted' ? 'Link to listing' : 'Match card'}
            </button>
            {p.type === 'order-line' && (
              <button className="btn" onClick={() => void run(() => dismissProblem(p.id, 'dismissed'), 'Dismissed')}>
                Dismiss
              </button>
            )}
          </div>
        ))}
      {(p.type === 'import' || p.type === 'pick-unverified') && (
        <div className="row">
          <button className="btn" onClick={() => void run(() => dismissProblem(p.id, 'reviewed'), 'Marked reviewed')}>
            Reviewed
          </button>
        </div>
      )}
    </div>
  );
}
