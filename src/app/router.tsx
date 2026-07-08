import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { RegistroScreen } from '../features/registro/RegistroScreen'
import { SnapshotsScreen } from '../features/snapshots/SnapshotsScreen'
import { CicloScreen } from '../features/ciclo/CicloScreen'

export const router = createBrowserRouter([
  { path: '/', element: <AppShell><DashboardScreen /></AppShell> },
  { path: '/registro', element: <AppShell><RegistroScreen /></AppShell> },
  { path: '/snapshots', element: <AppShell><SnapshotsScreen /></AppShell> },
  { path: '/ciclo', element: <AppShell><CicloScreen /></AppShell> },
])
