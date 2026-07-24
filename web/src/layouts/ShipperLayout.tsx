import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, type SessionUser } from '../api.js';

const NAV = [
  ['dashboard', 'Reliability Dashboard'],
  ['routes', 'Routes'],
  ['providers', 'Providers'],
  ['exceptions', 'Exceptions'],
  ['scorecards', 'Scorecards'],
] as const;

export default function ShipperLayout({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
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
          <small>Shipper</small>
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
