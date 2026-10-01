import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { importInventory, importOrders, type InventoryImportSummary } from '../db/importer';
import { createLocation, nextChaosCode, retireLocation, updateLocation, InventoryError } from '../db/inventory';
import { compareLocation } from '../domain/search';
import type { Location } from '../domain/types';
import { ConfirmButton, Meter, Screen } from '../ui/components';
import { useToast } from '../ui/toast';
import { errMsg } from '../ui/util';
import { useLocationCounts } from './shared';

export function ImportScreen({ go }: { go: (r: string) => void }) {
  const toast = useToast();
  const [complete, setComplete] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sum, setSum] = useState<InventoryImportSummary | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const s = await importInventory(await f.text(), { completeInventory: complete });
      setSum(s);
      if (s.missingColumns.length) toast(`This doesn't look like a TCGplayer inventory export (missing: ${s.missingColumns.join(', ')})`, 'error');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Import">
      <div className="panel">
        <h2>TCGplayer inventory</h2>
        <p className="hint">
          Seller Portal → Inventory → Export. This updates what <em>TCGplayer</em> says you have. It never changes your physical counts.
        </p>
        <label className="toggle">
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
          This file is my complete TCGplayer inventory (cards missing from it are listed as 0)
        </label>
        <label className={`btn btn-primary btn-wide file-btn ${busy ? 'disabled' : ''}`}>
          {busy ? 'Importing…' : 'Choose inventory CSV'}
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="inventory-file" />
        </label>
        {sum && !sum.missingColumns.length && (
          <dl className="stats" data-testid="import-summary">
            <dt>New cards</dt>
            <dd>{sum.added}</dd>
            <dt>Updated</dt>
            <dd>{sum.updated}</dd>
            <dt>Quantity changed</dt>
            <dd>{sum.qtyChanged}</dd>
            {complete && (
              <>
                <dt>No longer listed (→ 0)</dt>
                <dd>{sum.zeroedAbsent}</dd>
              </>
            )}
            <dt>Listed units</dt>
            <dd>{sum.totalListedQty}</dd>
            <dt>Rows needing review</dt>
            <dd>{sum.rejected + sum.identityConflicts}</dd>
          </dl>
        )}
        {sum && sum.rejected + sum.identityConflicts > 0 && (
          <button className="btn btn-wide" onClick={() => go('fix')}>
            Review in Fix
          </button>
        )}
      </div>
      <div className="panel">
        <h2>Orders</h2>
        <p className="hint">TCGplayer pull sheet or an order export with Order #, SkuId and Quantity columns.</p>
        <label className="btn btn-wide file-btn">
          Choose orders CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const s = await importOrders(await f.text());
                toast(s.orders ? `Imported ${s.orders} orders` : (s.errors[0] ?? 'No orders found'), s.orders ? 'ok' : 'error');
                if (s.orders) go('pick');
              } catch (err) {
                toast(errMsg(err), 'error');
              }
            }}
          />
        </label>
      </div>
    </Screen>
  );
}

export function LocationsScreen() {
  const toast = useToast();
  const locations = (useLiveQuery(() => db().locations.toArray(), []) ?? []).filter((l) => l.kind !== 'system').sort((a, b) => compareLocation(a.code, b.code));
  const sets = useLiveQuery(async () => [...new Set((await db().items.toArray()).filter((i) => i.marketplaceQty > 0).map((i) => i.setName))].sort(), []) ?? [];
  const counts = useLocationCounts();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'sorted' | 'chaos'>('sorted');
  const [editing, setEditing] = useState<string | null>(null);

  const add = async () => {
    try {
      await createLocation(code || (await nextChaosCode()), kind);
      setCode('');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const addChaosBatch = async (n: number) => {
    try {
      for (let i = 0; i < n; i++) await createLocation(await nextChaosCode(), 'chaos');
      toast(`Added ${n} chaos bins`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Screen title="Locations">
      <div className="panel">
        <div className="seg">
          <button className={kind === 'sorted' ? 'on' : ''} onClick={() => setKind('sorted')}>
            Sorted box (by set)
          </button>
          <button className={kind === 'chaos' ? 'on' : ''} onClick={() => setKind('chaos')}>
            Chaos bin
          </button>
        </div>
        <div className="row">
          <input
            placeholder={kind === 'chaos' ? 'blank = next C###' : 'e.g. B004'}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Location code"
          />
          <button className="btn btn-primary" onClick={() => void add()}>
            Add
          </button>
        </div>
        <button className="btn btn-wide" onClick={() => void addChaosBatch(5)}>
          Add 5 chaos bins
        </button>
      </div>
      <ul className="lines">
        {locations.map((l) => (
          <li key={l.code} className={`line loc-row ${l.retired ? 'retired' : ''}`}>
            <div className="loc-row-head" onClick={() => setEditing(editing === l.code ? null : l.code)}>
              <strong>{l.code}</strong>
              <span className="sub">
                {l.kind === 'chaos' ? 'Chaos' : 'Sorted'} · {counts.get(l.code) ?? 0}
                {l.capacity ? ` / ${l.capacity}` : ''} cards{l.retired ? ' · retired' : ''}
              </span>
              {l.setHomes.length > 0 && <span className="sub">Sets: {l.setHomes.join(', ')}</span>}
              {l.capacity ? <Meter value={counts.get(l.code) ?? 0} max={l.capacity} /> : null}
            </div>
            {editing === l.code && <LocationEditor loc={l} sets={sets} count={counts.get(l.code) ?? 0} />}
          </li>
        ))}
      </ul>
    </Screen>
  );
}

function LocationEditor({ loc, sets, count }: { loc: Location; sets: string[]; count: number }) {
  const toast = useToast();
  const [note, setNote] = useState(loc.note);
  const [cap, setCap] = useState(loc.capacity ? String(loc.capacity) : '');
  const [setQ, setSetQ] = useState('');
  const save = async (patch: Partial<Location>) => {
    try {
      await updateLocation(loc.code, patch);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const matches = setQ ? sets.filter((s) => s.toLowerCase().includes(setQ.toLowerCase()) && !loc.setHomes.includes(s)).slice(0, 8) : [];
  return (
    <div className="editor">
      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void save({ note })} placeholder="e.g. shelf 2, left" />
      </label>
      <label>
        Target capacity
        <input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} onBlur={() => void save({ capacity: cap ? Number(cap) : null })} />
      </label>
      {loc.kind === 'sorted' && (
        <div>
          <p className="hint">Sets that live here. Search and picking will point here before the box is audited (marked unverified).</p>
          <div className="chips">
            {loc.setHomes.map((s) => (
              <button key={s} className="chip" onClick={() => void save({ setHomes: loc.setHomes.filter((x) => x !== s) })}>
                {s} ✕
              </button>
            ))}
          </div>
          <input value={setQ} onChange={(e) => setSetQ(e.target.value)} placeholder="Add a set…" aria-label="Add set" />
          <div className="chips">
            {matches.map((s) => (
              <button
                key={s}
                className="chip chip-listed"
                onClick={() => {
                  void save({ setHomes: [...loc.setHomes, s] });
                  setSetQ('');
                }}
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {!loc.retired && (
        <ConfirmButton
          className="btn"
          onConfirm={async () => {
            try {
              await retireLocation(loc.code);
              toast(`${loc.code} retired`);
            } catch (e) {
              toast(e instanceof InventoryError ? e.message : errMsg(e), 'error');
            }
          }}
        >
          Retire {loc.code}
          {count ? ` (must be empty)` : ''}
        </ConfirmButton>
      )}
    </div>
  );
}
