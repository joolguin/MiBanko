import { useEffect, useState } from 'react'
import { useUserSettings, useSaveUserSettings } from '../../data/useUserSettings'

export function FreshnessSection() {
  const settings = useUserSettings()
  const save = useSaveUserSettings()
  const [days, setDays] = useState('4')

  useEffect(() => {
    if (settings.data) setDays(String(settings.data.freshLimitDays))
  }, [settings.data])

  function clamp(s: string): number { return Math.min(60, Math.max(1, Number(s) || 1)) }
  function submit() { save.mutate({ freshLimitDays: clamp(days) }) }

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.14em] text-faint">frescura</p>
      <label className="flex items-center justify-between text-sm text-zinc-400 mt-3">
        Avisarme si el snapshot supera (días)
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)}
          className="w-20 bg-ink-2 border border-ink-line rounded-lg px-3 py-2 outline-none focus:border-accent font-mono text-right" />
      </label>
      {save.isError && <p className="text-debt text-sm mt-2">No se pudo guardar. Reintentá.</p>}
      <button onClick={submit} disabled={save.isPending}
        className="mt-3 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] disabled:opacity-40">
        {save.isPending ? 'Guardando…' : 'Guardar umbral'}
      </button>
    </section>
  )
}
