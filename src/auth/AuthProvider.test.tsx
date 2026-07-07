import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

describe('AuthProvider', () => {
  it('should_ResolveLoadingToFalse_When_GetSessionRejects', async () => {
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('network down'))

    render(
      <AuthProvider>
        <RequireAuth>
          <p>contenido protegido</p>
        </RequireAuth>
      </AuthProvider>,
    )

    // Sin el .catch, loading nunca pasa a false y la pantalla queda en "Cargando…" para siempre.
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument()
  })
})
