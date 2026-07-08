import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  it('should_CallSignIn_When_SubmittingCredentials', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null })
    render(<LoginScreen signIn={signIn} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.cl')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))
    expect(signIn).toHaveBeenCalledWith('a@b.cl', 'secret')
  })

  it('should_ShowError_When_SignInFails', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: 'Invalid login credentials' })
    render(<LoginScreen signIn={signIn} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.cl')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'x')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))
    expect(await screen.findByText(/no pudimos entrar/i)).toBeInTheDocument()
  })
})
