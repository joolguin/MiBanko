import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SubscriptionCatchUp } from './app/SubscriptionCatchUp'
import { router } from './app/router'

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SubscriptionCatchUp />
        <RouterProvider router={router} />
      </RequireAuth>
    </AuthProvider>
  )
}
