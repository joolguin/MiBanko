import { useState, type FormEvent } from 'react'

interface Props {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
}

export function LoginScreen({ signIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setError('No pudimos entrar. Revisá el correo y la contraseña.')
  }

  return (
    <main className="min-h-[100dvh] flex flex-col justify-center px-6 font-sans">
      <p className="text-xs uppercase tracking-widest text-muted mb-2">MiBanko</p>
      <h1 className="text-3xl tracking-tight mb-8">Tu plata, de verdad.</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-sm">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm text-zinc-400">Email</label>
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm text-zinc-400">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />
        </div>
        {error && <p className="text-sm text-debt">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-2 bg-accent text-accent-deep font-medium rounded-lg py-3 active:scale-[0.98] transition-transform disabled:opacity-60">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
