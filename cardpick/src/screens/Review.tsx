import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportBackup, listSnapshots, restoreBackup, restoreSnapshot, validateBackup } from '../db/backup';
import { experimentStats, inventoryOverview, pickStats, putawayStats } from '../db/stats';
import { toCsv } from '../domain/csv';
import { evaluateExperiment, formatDuration } from '../domain/metrics';
import { homesBySet, itemView, reconcile, type ReconRow } from '../domain/status';
import type { Balance } from '../domain/types';
import { CardLabel, ConfirmButton, Meter, Screen, StatusBadge } from '../ui/components';
import { useToast } from '../ui/toast';
import { ago, download, errMsg, useMeta } from '../ui/util';

function useReconciliation() {
  return useLiveQuery(async () => {
    const d = db();
    const [items, balances, locations, problems] = await Promise.all([
      d.items.toArray(),
      d.balances.toArray(),
      d.locations.toArray(),
      d.problems.where('status').equals('open').toArray(),
    ]);
    const byItem = new Map<string, Balance[]>();
    for (const b of balances) byItem.set(b.itemId, [...(byItem.get(b.itemId) ?? []), b]);
    const withProblem = new Set(problems.map((p) => p.itemId));
    const homes = homesBySet(locations);
    const views = items.filter((i) => byItem.has(i.id) || withProblem.has(i.id)).map((i) => itemView(i, byItem.get(i.id) ?? [], homes, problems));
    return reconcile(views);
  }, []);
}

export function ReconcileScreen() {
  const r = useReconciliation();
  const [tab, setTab] = useState<'act' | 'blocked'>('act');
  if (!r) return null;
  const rows = tab === 'act' ? r.actionable : r.blocked;
  const exportCsv = () => {
    const out = [
      ['TCGplayer Id', 'Set Name', 'Product Name', 'Number', 'Condition', 'TCGplayer Qty', 'Physical Qty', 'Recommended Adjustment', 'Locations'],
      ...r.actionable.map((x) => [
        x.view.item.id,
        x.view.item.setName,
        x.view.item.productName,
        x.view.item.number,
        x.view.item.conditionRaw,
        x.view.item.marketplaceQty,
        x.view.physical,
        x.adjustment,
        x.view.locations.map((l) => `${l.location}:${l.qty}`).join(' '),
      ]),
    ];
    download(`cardpick-reconcile-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(out), 'text/csv');
  };
  return (
    <Screen title="Reconcile">
      <p className="hint">
        Verified physical counts vs TCGplayer. CardPick never changes TCGplayer: make the adjustment there, then re-import your inventory to clear it here.
      </p>
      <div className="session-bar">
        <span>
          <strong>{r.verifiedMatching}</strong> match
        </span>
        <span>
          <strong>{r.actionable.length}</strong> to adjust
        </span>
        <span>
          <strong>{r.blocked.length}</strong> blocked
        </span>
      </div>
      <div className="seg">
        <button className={tab === 'act' ? 'on' : ''} onClick={() => setTab('act')}>
          Adjust on TCGplayer
        </button>
        <button className={tab === 'blocked' ? 'on' : ''} onClick={() => setTab('blocked')}>
          Not yet trusted
        </button>
      </div>
      {tab === 'act' && r.actionable.length > 0 && (
        <button className="btn btn-wide" onClick={exportCsv}>
          Download adjustment list (CSV)
        </button>
      )}
      <ul className="lines">
        {rows.map((x) => (
          <ReconLine key={x.view.item.id} x={x} />
        ))}
        {!rows.length && <li className="empty">{tab === 'act' ? 'Nothing to adjust.' : 'Nothing blocked.'}</li>}
      </ul>
    </Screen>
  );
}

function ReconLine({ x }: { x: ReconRow }) {
  const v = x.view;
  return (
    <li className="line recon" data-testid="recon-row">
      <CardLabel item={v.item} />
      <div className="recon-nums">
        <span>TCG {v.item.marketplaceQty}</span>
        <span>Physical {v.physical}</span>
        {v.status === 'verified' ? (
          <strong className={x.adjustment > 0 ? 'pos' : 'neg'} data-testid="recon-adjustment">
            {x.adjustment > 0 ? '+' : ''}
            {x.adjustment}
          </strong>
        ) : (
          <StatusBadge status={v.status} />
        )}
      </div>
      {v.status !== 'verified' && (
        <span className="sub">
          {v.missing > 0 ? `${v.missing} missing under investigation. ` : ''}
          {v.uncountedHomes.length ? `Also check ${v.uncountedHomes.join(', ')}. ` : ''}
          {v.openProblems.map((p) => p.message).join('; ')}
        </span>
      )}
    </li>
  );
}

export function StatsScreen() {
  const data = useLiveQuery(async () => ({
    exp: await experimentStats(),
    put: await putawayStats(),
    pick: await pickStats(),
    inv: await inventoryOverview(),
  }));
  if (!data) return null;
  const { exp, put, pick, inv } = data;
  const ev = evaluateExperiment(exp);
  return (
    <Screen title="Progress">
      <div className="panel" data-testid="experiment">
        <h2>Audit experiment</h2>
        <Meter value={exp.cardsAudited} max={300} />
        <p>
          <strong>{ev.headline}</strong>
        </p>
        <dl className="stats">
          <dt>Cards audited</dt>
          <dd>{exp.cardsAudited}</dd>
          <dt>Different cards</dt>
          <dd>{exp.skusAudited}</dd>
          <dt>Active time</dt>
          <dd>{formatDuration(exp.activeMs)}</dd>
          <dt>Cards / hour</dt>
          <dd>{exp.cardsPerHour ? Math.round(exp.cardsPerHour) : '—'}</dd>
          <dt>Discrepancies</dt>
          <dd>{exp.discrepantSkus}</dd>
          <dt>Discrepancy rate</dt>
          <dd>{exp.discrepancyRate === null ? '—' : `${Math.round(exp.discrepancyRate * 1000) / 10}%`}</dd>
          <dt>Unlisted cards</dt>
          <dd>{exp.unlistedSkus}</dd>
        </dl>
        <p>{ev.recommendation}</p>
        {ev.details.map((d) => (
          <p key={d} className="hint">
            {d}
          </p>
        ))}
      </div>
      <div className="panel">
        <h2>Inventory truth</h2>
        <dl className="stats">
          <dt>Listed on TCGplayer</dt>
          <dd>
            {inv.marketplaceUnits} cards / {inv.skusListed} SKUs
          </dd>
          <dt>Physically recorded</dt>
          <dd>{inv.physicalUnits} cards</dd>
          <dt>Missing (investigating)</dt>
          <dd>{inv.missingUnits}</dd>
          <dt>Listed cards with physical evidence</dt>
          <dd>{inv.pctListedWithEvidence === null ? '—' : `${Math.round(inv.pctListedWithEvidence * 100)}%`}</dd>
        </dl>
      </div>
      <div className="panel">
        <h2>Put away</h2>
        <dl className="stats">
          <dt>Cards put away</dt>
          <dd>{put.cards}</dd>
          <dt>Time per 100 cards</dt>
          <dd>{put.per100Ms ? formatDuration(put.per100Ms) : '—'}</dd>
        </dl>
      </div>
      <div className="panel">
        <h2>Picking</h2>
        <dl className="stats">
          <dt>Batches / orders</dt>
          <dd>
            {pick.batches} / {pick.orders}
          </dd>
          <dt>Cards picked</dt>
          <dd>{pick.cardsPicked}</dd>
          <dt>Short picks</dt>
          <dd>{pick.shortTasks}</dd>
          <dt>Avg locations per batch</dt>
          <dd>{pick.avgStops === null ? '—' : pick.avgStops.toFixed(1)}</dd>
          <dt>Avg batch time</dt>
          <dd>{pick.avgBatchMs === null ? '—' : formatDuration(pick.avgBatchMs)}</dd>
        </dl>
      </div>
    </Screen>
  );
}

export function BackupScreen() {
  const toast = useToast();
  const lastBackup = useMeta<number | null>('lastBackupAt', null);
  const [snaps, setSnaps] = useState<Awaited<ReturnType<typeof listSnapshots>>>([]);
  const [pending, setPending] = useState<{ text: string; summary: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const refresh = () => void listSnapshots().then(setSnaps);
  useEffect(() => {
    refresh();
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  return (
    <Screen title="Backup">
      <div className="panel">
        <p>
          Your inventory lives only in this browser on this device. Last backup: <strong>{ago(lastBackup)}</strong>.
        </p>
        <button
          className="btn btn-primary btn-wide"
          onClick={async () => {
            const text = await exportBackup();
            download(`cardpick-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`, text);
            toast('Backup downloaded');
          }}
        >
          Download backup
        </button>
        {persisted === false && (
          <button
            className="btn btn-wide"
            onClick={async () => {
              const ok = await navigator.storage?.persist?.();
              setPersisted(!!ok);
              toast(ok ? 'Browser will keep CardPick data' : 'Browser declined; keep regular backups', ok ? 'ok' : 'info');
            }}
          >
            Ask browser to never clear CardPick data
          </button>
        )}
      </div>
      <div className="panel">
        <h2>Restore</h2>
        <label className="btn btn-wide file-btn">
          Choose backup file
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              const v = validateBackup(text);
              if (!v.ok) return toast(v.error, 'error');
              const c = v.backup.counts;
              setPending({ text, summary: `${new Date(v.backup.exportedAt).toLocaleString()} · ${c.items ?? 0} cards · ${c.balances ?? 0} balances · ${c.ledger ?? 0} movements` });
            }}
          />
        </label>
        {pending && (
          <div className="panel panel-warn">
            <p>Replace everything with backup from {pending.summary}? A safety snapshot of current data is taken first.</p>
            <ConfirmButton
              onConfirm={async () => {
                try {
                  await restoreBackup(pending.text);
                  setPending(null);
                  refresh();
                  toast('Backup restored');
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Restore this backup
            </ConfirmButton>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>Automatic snapshots</h2>
        <p className="hint">Taken before imports, restores and card links. The last 10 are kept in this browser.</p>
        <ul className="mini-list">
          {snaps.map((s) => (
            <li key={s.id}>
              <span>
                {new Date(s.at).toLocaleString()} · {s.reason}
              </span>
              <ConfirmButton
                className="btn btn-small"
                onConfirm={async () => {
                  try {
                    await restoreSnapshot(s.id);
                    refresh();
                    toast('Snapshot restored');
                  } catch (e) {
                    toast(errMsg(e), 'error');
                  }
                }}
              >
                Restore
              </ConfirmButton>
            </li>
          ))}
          {!snaps.length && <li className="empty">None yet.</li>}
        </ul>
      </div>
    </Screen>
  );
}

