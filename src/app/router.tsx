import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { Skeleton } from '../components/ui/Skeleton'

// Cada pantalla se carga on-demand para partir el bundle por ruta (el arranque
// solo baja el AppShell + la pantalla visitada, no las 6 juntas).
const DashboardScreen = lazy(() =>
  import('../features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))
const RegistroScreen = lazy(() =>
  import('../features/registro/RegistroScreen').then((m) => ({ default: m.RegistroScreen })))
const SnapshotsScreen = lazy(() =>
  import('../features/snapshots/SnapshotsScreen').then((m) => ({ default: m.SnapshotsScreen })))
const CicloScreen = lazy(() =>
  import('../features/ciclo/CicloScreen').then((m) => ({ default: m.CicloScreen })))
const HistorialScreen = lazy(() =>
  import('../features/historial/HistorialScreen').then((m) => ({ default: m.HistorialScreen })))
const AjustesScreen = lazy(() =>
  import('../features/ajustes/AjustesScreen').then((m) => ({ default: m.AjustesScreen })))

function RouteFallback() {
  return (
    <section className="px-6 pt-10">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-14 w-56 mb-3" />
      <Skeleton className="h-4 w-40" />
    </section>
  )
}

function screen(node: ReactNode) {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>{node}</Suspense>
    </AppShell>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: screen(<DashboardScreen />) },
  { path: '/registro', element: screen(<RegistroScreen />) },
  { path: '/snapshots', element: screen(<SnapshotsScreen />) },
  { path: '/ciclo', element: screen(<CicloScreen />) },
  { path: '/historial', element: screen(<HistorialScreen />) },
  { path: '/ajustes', element: screen(<AjustesScreen />) },
])
