import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, type SessionUser } from '../api.js';

const NAV = [
  ['dashboard', 'Operations Dashboard'],
  ['coverage-board', 'Coverage Board'],
  ['routes', 'Routes'],
  ['drivers', 'Drivers'],
  ['driver-pools', 'Driver Pools'],
  ['recovery-queue', 'Recovery Queue'],
  ['cancellations', 'Cancellations'],
  ['shippers', 'Shippers'],
  ['reports', 'Reports'],
  ['incentives', 'Incentives'],
  ['settings', 'Settings'],
] as const;

export default function OperatorLayout({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const navigate = useNavigate();

  function logout() {
    clearSession();
    onLogout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          RoutePilot
          <small>Operator</small>
        </div>
        <nav>
          {NAV.map(([path, label]) => (
            <NavLink key={path} to={path} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          {user.name}
          <br />
          {user.role.replace(/_/g, ' ')}
          <br />
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
