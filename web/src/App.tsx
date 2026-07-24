import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getUser, type SessionUser } from './api.js';
import LoginPage from './pages/LoginPage.js';
import DriverLinkPage from './pages/DriverLinkPage.js';
import OperatorLayout from './layouts/OperatorLayout.js';
import ShipperLayout from './layouts/ShipperLayout.js';
import OperatorDashboard from './pages/operator/Dashboard.js';
import CoverageBoard from './pages/operator/CoverageBoard.js';
import RoutesList from './pages/operator/RoutesList.js';
import RouteDetail from './pages/operator/RouteDetail.js';
import Drivers from './pages/operator/Drivers.js';
import DriverPools from './pages/operator/DriverPools.js';
import RecoveryQueue from './pages/operator/RecoveryQueue.js';
import Cancellations from './pages/operator/Cancellations.js';
import Shippers from './pages/operator/Shippers.js';
import Reports from './pages/operator/Reports.js';
import Incentives from './pages/operator/Incentives.js';
import Settings from './pages/operator/Settings.js';
import ShipperDashboard from './pages/shipper/Dashboard.js';
import ShipperRoutes from './pages/shipper/Routes.js';
import ShipperProviders from './pages/shipper/Providers.js';
import ShipperExceptions from './pages/shipper/Exceptions.js';
import ShipperScorecards from './pages/shipper/Scorecards.js';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(getUser());

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={setUser} />} />
      <Route path="/r/:token" element={<DriverLinkPage />} />

      {user?.organizationType === 'OPERATOR' ? (
        <Route path="/operator" element={<OperatorLayout user={user} onLogout={() => setUser(null)} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboard />} />
          <Route path="coverage-board" element={<CoverageBoard />} />
          <Route path="routes" element={<RoutesList />} />
          <Route path="routes/:id" element={<RouteDetail />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="driver-pools" element={<DriverPools />} />
          <Route path="recovery-queue" element={<RecoveryQueue />} />
          <Route path="cancellations" element={<Cancellations />} />
          <Route path="shippers" element={<Shippers />} />
          <Route path="reports" element={<Reports />} />
          <Route path="incentives" element={<Incentives />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      ) : (
        <Route path="/operator/*" element={<Navigate to="/login" replace />} />
      )}

      {user?.organizationType === 'SHIPPER' ? (
        <Route path="/shipper" element={<ShipperLayout user={user} onLogout={() => setUser(null)} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ShipperDashboard />} />
          <Route path="routes" element={<ShipperRoutes />} />
          <Route path="providers" element={<ShipperProviders />} />
          <Route path="exceptions" element={<ShipperExceptions />} />
          <Route path="scorecards" element={<ShipperScorecards />} />
          <Route path="reports" element={<ShipperScorecards />} />
        </Route>
      ) : (
        <Route path="/shipper/*" element={<Navigate to="/login" replace />} />
      )}

      <Route
        path="/"
        element={
          user?.organizationType === 'OPERATOR' ? (
            <Navigate to="/operator" replace />
          ) : user?.organizationType === 'SHIPPER' ? (
            <Navigate to="/shipper" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
