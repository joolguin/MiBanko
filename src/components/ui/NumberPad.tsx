import { Backspace } from '@phosphor-icons/react'

interface Props { value: number; onChange: (n: number) => void }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function NumberPad({ value, onChange }: Props) {
  function press(k: string) {
    if (k === 'del') return onChange(Math.floor(value / 10))
    if (k === '') return
    const next = value * 10 + Number(k)
    if (next > 999_999_999) return
    onChange(next)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k, i) =>
        k === '' ? <span key={i} /> : (
          <button key={i} type="button" onClick={() => press(k)}
            aria-label={k === 'del' ? 'Borrar' : k}
            className="py-4 rounded-xl bg-ink-2 text-2xl font-mono active:scale-[0.97] transition-transform flex items-center justify-center">
            {k === 'del' ? <Backspace size={24} /> : k}
          </button>
        ),
      )}
    </div>
  )
}
