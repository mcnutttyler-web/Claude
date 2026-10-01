import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { ensureSystemLocations } from './db/inventory';
import { AuditScreen } from './screens/Audit';
import { FindScreen } from './screens/Find';
import { FixScreen } from './screens/Fix';
import { PickScreen } from './screens/Pick';
import { PutAwayScreen } from './screens/PutAway';
import { BackupScreen, ReconcileScreen, StatsScreen } from './screens/Review';
import { ImportScreen, LocationsScreen } from './screens/Setup';
import { useOpenProblemCount } from './screens/shared';
import { ToastProvider } from './ui/toast';
import { useHashRoute, useMeta } from './ui/util';

const TABS = [
  { id: 'audit', label: 'Audit', icon: '☑' },
  { id: 'putaway', label: 'Put Away', icon: '⇩' },
  { id: 'pick', label: 'Pick', icon: '⇧' },
  { id: 'find', label: 'Find', icon: '⌕' },
  { id: 'fix', label: 'Fix', icon: '⚑' },
] as const;

const MORE = [
  { id: 'reconcile', label: 'Reconcile with TCGplayer' },
  { id: 'stats', label: 'Progress & audit experiment' },
  { id: 'import', label: 'Import from TCGplayer' },
  { id: 'locations', label: 'Locations & chaos bins' },
  { id: 'backup', label: 'Backup & restore' },
];

export function App() {
  const [route, go] = useHashRoute();
  const fixCount = useOpenProblemCount();
  const lastBackup = useMeta<number | null>('lastBackupAt', null);
  const hasData = useLiveQuery(async () => (await db().ledger.count()) > 0, [], false);
  useEffect(() => {
    void ensureSystemLocations();
  }, []);
  const r = route.split('/')[0] || 'audit';
  const backupStale = hasData && (!lastBackup || Date.now() - lastBackup > 3 * 86400_000);

  let body;
  switch (r) {
    case 'audit':
      body = <AuditScreen go={go} />;
      break;
    case 'putaway':
      body = <PutAwayScreen go={go} />;
      break;
    case 'pick':
      body = <PickScreen go={go} />;
      break;
    case 'find':
      body = <FindScreen />;
      break;
    case 'fix':
      body = <FixScreen />;
      break;
    case 'reconcile':
      body = <ReconcileScreen />;
      break;
    case 'stats':
      body = <StatsScreen />;
      break;
    case 'import':
      body = <ImportScreen go={go} />;
      break;
    case 'locations':
      body = <LocationsScreen />;
      break;
    case 'backup':
      body = <BackupScreen />;
      break;
    default:
      body = (
        <section className="screen">
          <div className="screen-head">
            <h1>More</h1>
          </div>
          <ul className="menu">
            {MORE.map((m) => (
              <li key={m.id}>
                <button className="btn btn-wide menu-btn" onClick={() => go(m.id)}>
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">CardPick keeps TCGplayer data, physical counts, and verification separate. Data stays on this device.</p>
        </section>
      );
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <span className="brand">CardPick</span>
          {backupStale && (
            <button className="pill pill-warn" onClick={() => go('backup')}>
              Back up
            </button>
          )}
          <button className={`pill ${r === 'more' || MORE.some((m) => m.id === r) ? 'on' : ''}`} onClick={() => go('more')} aria-label="More">
            ☰ More
          </button>
        </header>
        <main>{body}</main>
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${r === t.id ? 'on' : ''}`} onClick={() => go(t.id)} aria-label={t.label}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
              {t.id === 'fix' && fixCount > 0 && <span className="tab-badge">{fixCount}</span>}
            </button>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
