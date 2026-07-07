import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { LoginScreen } from './LoginScreen'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, signIn } = useAuth()
  if (loading) {
    return <main className="min-h-[100dvh] flex items-center justify-center">
      <p className="text-zinc-600 text-sm">Cargando…</p>
    </main>
  }
  if (!session) return <LoginScreen signIn={signIn} />
  return <>{children}</>
}
