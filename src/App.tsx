import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { router } from './app/router'

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <RouterProvider router={router} />
      </RequireAuth>
    </AuthProvider>
  )
}
