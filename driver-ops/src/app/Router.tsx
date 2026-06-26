import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { DriversPage } from '@/features/drivers/DriversPage'
import { RoutesPage } from '@/features/routes/RoutesPage'
import { CallQueue } from '@/features/calls/CallQueue'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'drivers', element: <DriversPage /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'calls', element: <CallQueue /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
