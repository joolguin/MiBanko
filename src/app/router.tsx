import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { RegistroScreen } from '../features/registro/RegistroScreen'

export const router = createBrowserRouter([
  { path: '/', element: <AppShell><DashboardScreen /></AppShell> },
  { path: '/registro', element: <AppShell><RegistroScreen /></AppShell> },
])
