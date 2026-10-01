import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react';
import { searchItems, compareLocation } from '../domain/search';
import { shortVariant, BASE_CONDITIONS } from '../domain/tcgplayer';
import type { Item, Location } from '../domain/types';
import type { ItemStatus } from '../domain/status';
import { createUnlistedItem } from '../db/importer';
import { useToast } from './toast';
import { errMsg } from './util';

export function Screen({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="screen">
      <div className="screen-head">
        <h1>{title}</h1>
        {right}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const label = status === 'verified' ? 'Verified' : status === 'needs-review' ? 'Needs Review' : 'Unverified';
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function CardLabel({ item, sub = true }: { item: Item; sub?: boolean }) {
  return (
    <span className="card-label">
      <strong>{item.productName}</strong> <span className="variant">{shortVariant(item)}</span>
      {item.unlisted && <span className="badge badge-needs-review">Unlisted</span>}
      {sub && (
        <span className="sub">
          {item.setName}
          {item.number && ` · #${item.number}`}
        </span>
      )}
    </span>
  );
}

export interface CardSearchProps {
  items: Item[];
  onPick: (item: Item) => void | Promise<void>;
  preferredSets?: string[];
  /** Small note per variant chip, e.g. "3 here". */
  note?: (item: Item) => string | null;
  filter?: (item: Item) => boolean;
  allowUnlisted?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Point-of-sale style search: type a few letters, tap the exact
 * condition/printing chip. The box clears and refocuses for the next card.
 * Enter picks the top result when it is unambiguous (one product, one variant).
 */
export function CardSearch({ items, onPick, preferredSets, note, filter, allowUnlisted, placeholder, autoFocus = true }: CardSearchProps) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pool = useMemo(() => (filter ? items.filter(filter) : items), [items, filter]);
  // Deferred + 2-char minimum keeps typing smooth on large catalogs.
  const dq = useDeferredValue(q);
  const groups = useMemo(() => (dq.trim().length >= 2 ? searchItems(pool, dq, { preferredSets, limit: 12 }) : []), [pool, dq, preferredSets]);

  const pick = async (it: Item) => {
    // Clear before the write finishes so fast typing of the next card is never wiped.
    setQ('');
    setAdding(false);
    input.current?.focus();
    await onPick(it);
  };

  return (
    <div className="card-search">
      <input
        ref={input}
        className="search-input"
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Card name, number, set…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (dq !== q) return; // results not caught up with typing yet
            const g = groups[0];
            if (g && groups.length === 1 && g.variants.length === 1) void pick(g.variants[0]!);
          }
          if (e.key === 'Escape') setQ('');
        }}
        aria-label="Search cards"
      />
      {q && (
        <ul className="results">
          {groups.map((g) => (
            <li key={g.key} className="result">
              <div className="result-title">
                <strong>{g.productName}</strong>
                <span className="sub">
                  {g.setName}
                  {g.number && ` · #${g.number}`}
                  {g.rarity && ` · ${g.rarity}`}
                </span>
              </div>
              <div className="chips">
                {g.variants.map((v) => {
                  const n = note?.(v);
                  return (
                    <button
                      key={v.id}
                      className={`chip ${v.marketplaceQty > 0 ? 'chip-listed' : ''}`}
                      onClick={() => void pick(v)}
                      aria-label={`${g.productName} ${shortVariant(v)}`}
                    >
                      <span>{shortVariant(v)}</span>
                      <small>{n ?? (v.unlisted ? 'unlisted' : `TCG ${v.marketplaceQty}`)}</small>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
          {!groups.length && q.trim().length >= 2 && dq === q && <li className="empty">No match for “{q}”.</li>}
          {allowUnlisted && !adding && (
            <li>
              <button className="btn-link" onClick={() => setAdding(true)}>
                Card not in the list? Record it as unlisted
              </button>
            </li>
          )}
        </ul>
      )}
      {adding && <UnlistedForm initialName={q} onDone={(it) => void pick(it)} onCancel={() => setAdding(false)} />}
    </div>
  );
}

function UnlistedForm({ initialName, onDone, onCancel }: { initialName: string; onDone: (i: Item) => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ productName: initialName, setName: '', number: '', condition: 'Near Mint', printing: '' });
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const it = await createUnlistedItem({
            productName: f.productName,
            setName: f.setName,
            number: f.number,
            conditionRaw: [f.condition, f.printing].filter(Boolean).join(' '),
          });
          toast('Recorded as unlisted — it will show in Fix until linked');
          onDone(it);
        } catch (err) {
          toast(errMsg(err), 'error');
        }
      }}
    >
      <p className="hint">Not on TCGplayer yet. CardPick keeps it separate and flags it for Fix.</p>
      <label>
        Name <input value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} required />
      </label>
      <label>
        Set <input value={f.setName} onChange={(e) => setF({ ...f, setName: e.target.value })} required />
      </label>
      <label>
        Number <input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
      </label>
      <div className="seg">
        {BASE_CONDITIONS.map((c) => (
          <button type="button" key={c} className={f.condition === c ? 'on' : ''} onClick={() => setF({ ...f, condition: c })}>
            {c.split(' ').map((w) => w[0]).join('')}
          </button>
        ))}
      </div>
      <div className="seg">
        {['', 'Holofoil', 'Reverse Holofoil'].map((p) => (
          <button type="button" key={p} className={f.printing === p ? 'on' : ''} onClick={() => setF({ ...f, printing: p })}>
            {p || 'Normal'}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary">Add card</button>
      </div>
    </form>
  );
}

export function LocationPicker({
  locations,
  kinds,
  value,
  onChange,
  counts,
  extra,
}: {
  locations: Location[];
  kinds: Location['kind'][];
  value?: string | null;
  onChange: (code: string) => void;
  counts?: Map<string, number>;
  extra?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const list = locations
    .filter((l) => kinds.includes(l.kind) && !l.retired)
    .filter((l) => !q || l.code.includes(q.toUpperCase()) || l.note.toLowerCase().includes(q.toLowerCase()) || l.setHomes.some((s) => s.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => compareLocation(a.code, b.code));
  return (
    <div className="loc-picker">
      {locations.filter((l) => kinds.includes(l.kind)).length > 8 && (
        <input className="search-input" placeholder="Find location or set…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find location" />
      )}
      <div className="loc-grid">
        {list.map((l) => (
          <button key={l.code} className={`loc-btn ${value === l.code ? 'on' : ''}`} onClick={() => onChange(l.code)}>
            <strong>{l.code}</strong>
            <small>
              {counts?.get(l.code) ?? 0}
              {l.capacity ? ` / ${l.capacity}` : ''} cards
            </small>
            {(l.note || l.setHomes.length > 0) && <small className="loc-note">{l.note || l.setHomes.join(', ')}</small>}
          </button>
        ))}
        {extra}
      </div>
    </div>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <button className="btn btn-big" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="decrease">
        −
      </button>
      <span className="stepper-val" aria-live="polite">
        {value}
      </span>
      <button className="btn btn-big" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="increase">
        +
      </button>
    </div>
  );
}

/** Two-tap confirm for the few genuinely destructive actions (no modal dialogs). */
export function ConfirmButton({ children, onConfirm, className = 'btn btn-danger' }: { children: ReactNode; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? 'Tap again to confirm' : children}
    </button>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`meter ${pct >= 100 ? 'meter-full' : pct >= 90 ? 'meter-warn' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
