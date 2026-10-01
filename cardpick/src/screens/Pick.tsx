import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { importOrders } from '../db/importer';
import { activeBatch, archiveOrder, completeBatch, confirmTask, createBatch, reopenOrder, undoTask, type BatchSummary } from '../db/picking';
import { compareLocation } from '../domain/search';
import { formatDuration } from '../domain/metrics';
import type { Item, PickBatch, PickTask } from '../domain/types';
import { CardLabel, Screen, Stepper } from '../ui/components';
import { useToast } from '../ui/toast';
import { buzz, errMsg, plural, useItemMap } from '../ui/util';

export function PickScreen({ go }: { go: (r: string) => void }) {
  const batch = useLiveQuery(() => activeBatch(), []);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  if (batch === undefined) return null;
  if (summary) {
    return (
      <Screen title="Batch done">
        <div className="panel">
          <dl className="stats">
            <dt>Cards picked</dt>
            <dd>
              {summary.picked} / {summary.needed}
            </dd>
            <dt>Orders complete</dt>
            <dd>{summary.ordersComplete}</dd>
            <dt>Orders short</dt>
            <dd>{summary.ordersShort}</dd>
            <dt>Locations visited</dt>
            <dd>{summary.stops}</dd>
            <dt>Active time</dt>
            <dd>{formatDuration(summary.activeMs)}</dd>
          </dl>
          {summary.ordersShort > 0 && (
            <button className="btn btn-wide" onClick={() => go('fix')}>
              Investigate shortages in Fix
            </button>
          )}
        </div>
        <button className="btn btn-primary btn-wide" onClick={() => setSummary(null)}>
          Back to orders
        </button>
      </Screen>
    );
  }
  return batch ? <ActiveBatch batch={batch} onComplete={setSummary} /> : <OrderQueue />;
}

function OrderQueue() {
  const toast = useToast();
  const orders = useLiveQuery(() => db().orders.toArray(), []) ?? [];
  const open = orders.filter((o) => o.status === 'open').sort((a, b) => (a.orderedAt ?? 0) - (b.orderedAt ?? 0));
  const closed = orders.filter((o) => o.status === 'short' || o.status === 'picked');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = open.filter((o) => !excluded.has(o.id));
  const cards = selected.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty - l.picked, 0), 0);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = await importOrders(await f.text());
      if (s.errors.length && !s.orders) toast(s.errors[0]!, 'error');
      else toast(`Imported ${s.orders} orders (${s.lines} lines${s.unmatched ? `, ${s.unmatched} need matching in Fix` : ''})`, s.unmatched ? 'info' : 'ok');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Screen title="Pick">
      <label className="btn btn-wide file-btn">
        Import orders (TCGplayer CSV)
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} hidden data-testid="orders-file" />
      </label>
      {open.length === 0 ? (
        <p className="hint">No open orders. Export a pull sheet or order list from TCGplayer and import it.</p>
      ) : (
        <>
          <ul className="lines">
            {open.map((o) => (
              <li key={o.id} className="line">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!excluded.has(o.id)}
                    onChange={(e) => {
                      const n = new Set(excluded);
                      if (e.target.checked) n.delete(o.id);
                      else n.add(o.id);
                      setExcluded(n);
                    }}
                  />
                  <span>
                    <strong>{o.id}</strong> {o.buyer && <span className="sub">{o.buyer}</span>}
                    <span className="sub">
                      {o.lines.reduce((a, l) => a + l.qty, 0)} cards
                      {o.lines.some((l) => !l.itemId) && ' · has unmatched lines'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="thumb-bar">
            <button
              className="btn btn-primary"
              disabled={!selected.length}
              onClick={async () => {
                try {
                  await createBatch(selected.map((o) => o.id));
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Pick {plural(selected.length, 'order')} · {plural(cards, 'card')}
            </button>
          </div>
        </>
      )}
      {closed.length > 0 && (
        <div className="panel">
          <h2>Recently picked</h2>
          <ul className="mini-list">
            {closed.map((o) => (
              <li key={o.id}>
                <strong>{o.id}</strong> <span className={`badge ${o.status === 'short' ? 'badge-needs-review' : 'badge-verified'}`}>{o.status === 'short' ? 'Short' : 'Picked'}</span>
                <span className="row-actions">
                  {o.status === 'short' && (
                    <button className="btn btn-small" onClick={() => void reopenOrder(o.id)}>
                      Pick again
                    </button>
                  )}
                  <button className="btn btn-small" onClick={() => void archiveOrder(o.id)}>
                    Shipped
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Screen>
  );
}

interface Stop {
  location: string;
  tasks: PickTask[];
}

function stopsOf(b: PickBatch): Stop[] {
  const m = new Map<string, PickTask[]>();
  for (const t of b.tasks) m.set(t.location, [...(m.get(t.location) ?? []), t]);
  return [...m.entries()].map(([location, tasks]) => ({ location, tasks })).sort((a, b) => compareLocation(a.location, b.location));
}

function ActiveBatch({ batch, onComplete }: { batch: PickBatch; onComplete: (s: BatchSummary) => void }) {
  const toast = useToast();
  const items = useItemMap();
  const orders = useLiveQuery(() => db().orders.bulkGet(batch.orderIds), [batch.orderIds.join()]) ?? [];
  const stops = stopsOf(batch);
  const todoStops = stops.filter((s) => s.tasks.some((t) => t.status === 'todo'));
  const doneTasks = batch.tasks.filter((t) => t.status === 'done');
  const current = todoStops[0];
  const allDone = todoStops.length === 0;
  const orderShort = new Map<string, number>();
  orders.forEach((o, i) => o && orderShort.set(o.id, i + 1));

  return (
    <Screen title="Picking">
      <div className="session-bar">
        <span>
          Stop <strong>{Math.min(stops.length - todoStops.length + 1, stops.length)}</strong> of {stops.length}
        </span>
        <span>{batch.orderIds.length} orders</span>
        <span>
          <strong>{batch.tasks.filter((t) => t.status === 'todo').reduce((s, t) => s + t.qty, 0)}</strong> cards left
        </span>
      </div>
      {current && (
        <div className="stop" data-testid="current-stop">
          <div className="stop-loc">Go to {current.location}</div>
          {current.tasks
            .filter((t) => t.status === 'todo')
            .map((t) => (
              <TaskCard key={t.id} task={t} item={items.get(t.itemId)} batchId={batch.id} orderNo={orderShort} />
            ))}
        </div>
      )}
      {todoStops.length > 1 && (
        <div className="panel">
          <h2>Next stops</h2>
          <ul className="mini-list">
            {todoStops.slice(1).map((s) => (
              <li key={s.location}>
                <strong>{s.location}</strong> {plural(s.tasks.filter((t) => t.status === 'todo').reduce((a, t) => a + t.qty, 0), 'card')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {batch.unlocated.length > 0 && (
        <div className="panel panel-warn">
          <h2>Not located ({plural(batch.unlocated.reduce((s, u) => s + u.qty, 0), 'card')})</h2>
          <p className="hint">CardPick has no verified location or set home for these. They stay short unless you find them.</p>
          <ul className="mini-list">
            {batch.unlocated.map((u, i) => {
              const it = items.get(u.itemId);
              return (
                <li key={i}>
                  {it ? <CardLabel item={it} /> : u.itemId} ×{u.qty}
                  <span className="sub">{u.orders.map((o) => `${o.orderId} ×${o.qty}`).join(', ')}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {doneTasks.length > 0 && (
        <div className="panel">
          <h2>Done</h2>
          <ul className="mini-list">
            {[...doneTasks].reverse().map((t) => {
              const it = items.get(t.itemId);
              return (
                <li key={t.id}>
                  <span>
                    {t.location} · {it ? `${it.productName}` : t.itemId} {t.found}/{t.qty}
                    {(t.found ?? 0) < t.qty && <span className="badge badge-needs-review">short</span>}
                  </span>
                  <button
                    className="btn btn-small"
                    onClick={async () => {
                      try {
                        await undoTask(batch.id, t.id);
                      } catch (e) {
                        toast(errMsg(e), 'error');
                      }
                    }}
                  >
                    Undo
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {allDone && (
        <div className="thumb-bar">
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                onComplete(await completeBatch(batch.id));
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Finish batch
          </button>
        </div>
      )}
    </Screen>
  );
}

function TaskCard({ task, item, batchId, orderNo }: { task: PickTask; item: Item | undefined; batchId: string; orderNo: Map<string, number> }) {
  const toast = useToast();
  const [fewer, setFewer] = useState(false);
  const [found, setFound] = useState(task.qty - 1);
  useEffect(() => setFound(task.qty - 1), [task.qty]);
  const confirm = async (n: number) => {
    try {
      await confirmTask(batchId, task.id, n);
      buzz();
      if (n < task.qty) toast(`Short ${task.qty - n}. ${task.verified ? 'Flagged as missing and re-routed if possible.' : 'Flagged for Fix.'}`, 'info');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="task">
      <div className="task-head">
        {item ? <CardLabel item={item} /> : <span>{task.itemId}</span>}
        <span className="task-qty">×{task.qty}</span>
      </div>
      {!task.verified && <p className="badge badge-unverified">Expected here by set · not counted yet</p>}
      <div className="order-chips">
        {task.orders.map((o) => (
          <span key={o.orderId} className="order-chip" title={o.orderId}>
            #{orderNo.get(o.orderId) ?? '?'} {o.orderId.slice(-6)} ×{o.qty}
          </span>
        ))}
      </div>
      {fewer ? (
        <div className="fewer">
          <span>How many did you find?</span>
          <Stepper value={found} min={0} max={task.qty - 1} onChange={setFound} />
          <div className="row">
            <button className="btn" onClick={() => setFewer(false)}>
              Back
            </button>
            <button className="btn btn-warn" onClick={() => void confirm(found)}>
              Found {found}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setFewer(true)}>
            Found fewer
          </button>
          <button className="btn btn-primary btn-big" onClick={() => void confirm(task.qty)}>
            Got {task.qty}
          </button>
        </div>
      )}
    </div>
  );
}

