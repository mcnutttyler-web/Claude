import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { homesBySet, itemView, type ItemView } from '../domain/status';
import { shortVariant } from '../domain/tcgplayer';
import type { Item } from '../domain/types';
import { CardSearch, Screen, StatusBadge } from '../ui/components';
import { useItems } from '../ui/util';

export function FindScreen() {
  const items = useItems() ?? [];
  const [picked, setPicked] = useState<Item | null>(null);
  return (
    <Screen title="Find">
      <CardSearch items={items} onPick={(i) => setPicked(i)} note={() => null} placeholder="Find a card…" />
      {picked && <CardDetail itemId={picked.id} />}
    </Screen>
  );
}

/** Everything about one product: each condition/printing, where it is, and how sure we are. */
export function CardDetail({ itemId }: { itemId: string }) {
  const data = useLiveQuery(async () => {
    const d = db();
    const item = await d.items.get(itemId);
    if (!item) return null;
    const siblings = await d.items
      .where('setName')
      .equals(item.setName)
      .filter((i) => i.productName === item.productName && i.number === item.number)
      .toArray();
    const [locs, problems] = await Promise.all([d.locations.toArray(), d.problems.where('status').equals('open').toArray()]);
    const homes = homesBySet(locs);
    const views: ItemView[] = [];
    for (const s of siblings) views.push(itemView(s, await d.balances.where('itemId').equals(s.id).toArray(), homes, problems));
    const history = (await d.ledger.where('itemId').anyOf(siblings.map((s) => s.id)).toArray()).sort((a, b) => b.at - a.at).slice(0, 12);
    return { item, views: views.sort((a, b) => b.physical + b.item.marketplaceQty - (a.physical + a.item.marketplaceQty)), history };
  }, [itemId]);
  if (!data) return null;
  const { item, views, history } = data;
  return (
    <div className="detail" data-testid="card-detail">
      <h2>
        {item.productName} <span className="sub">{item.setName} · #{item.number}</span>
      </h2>
      {views.map((v) => (
        <div key={v.item.id} className={`panel variant-panel ${v.item.id === itemId ? 'panel-focus' : ''}`}>
          <div className="variant-head">
            <strong>{shortVariant(v.item)}</strong>
            <StatusBadge status={v.status} />
          </div>
          <dl className="stats">
            <dt>Physical</dt>
            <dd data-testid="physical-total">{v.physical}</dd>
            <dt>TCGplayer</dt>
            <dd>{v.item.unlisted ? 'not listed' : v.item.marketplaceQty}</dd>
            {v.missing > 0 && (
              <>
                <dt>Missing</dt>
                <dd>{v.missing}</dd>
              </>
            )}
          </dl>
          {v.locations.length > 0 ? (
            <ul className="loc-list">
              {v.locations.map((l) => (
                <li key={l.location}>
                  <strong>{l.location}</strong> × {l.qty}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No counted location yet.</p>
          )}
          {v.uncountedHomes.length > 0 && <p className="hint">Its set lives in {v.uncountedHomes.join(', ')} (not counted for this card yet).</p>}
          {v.status === 'verified' && v.physical !== v.item.marketplaceQty && !v.item.unlisted && (
            <p className="adjust">
              Recommended TCGplayer adjustment: <strong>{v.physical - v.item.marketplaceQty > 0 ? '+' : ''}{v.physical - v.item.marketplaceQty}</strong>
            </p>
          )}
          {v.openProblems.map((p) => (
            <p key={p.id} className="badge badge-needs-review">
              {p.message}
            </p>
          ))}
        </div>
      ))}
      {history.length > 0 && (
        <details className="panel">
          <summary>History</summary>
          <ul className="mini-list">
            {history.map((h) => (
              <li key={h.id}>
                {new Date(h.at).toLocaleString()} · {h.type} {h.delta > 0 ? '+' : ''}
                {h.delta} @ {h.location}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
