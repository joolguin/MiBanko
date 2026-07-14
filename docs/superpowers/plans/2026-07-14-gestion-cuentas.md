# Gestión de cuentas en la app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear, editar y desactivar/reactivar cuentas (débito/crédito/inversión) desde la pantalla de Ajustes, reemplazando el insert manual en la base de datos.

**Architecture:** Se calca el patrón Sección + BottomSheet de Categorías. Capa de datos: hooks nuevos en `useAccounts.ts` (`useManageAccounts`, `useSaveAccount`, `useSetAccountActive`) que hablan con la tabla `accounts` existente. Capa UI: `AccountsSection` (lista activas + inactivas) monta `AccountSheet` (formulario), y se enchufa en `AjustesScreen`.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Supabase JS, Vitest + Testing Library, Tailwind, @phosphor-icons/react.

## Global Constraints

- **Quitar = desactivar (soft), nunca borrar.** Desactivar hace `is_active = false`; reactivar lo revierte. Las cuentas se referencian desde `transactions`, borrarlas rompería el historial.
- **El tipo es fijo tras crear.** Se elige al crear; al editar solo cambian `name` y `bank`. La UI de edición NO muestra el selector de tipo.
- **Default del selector de tipo:** `debit` (Débito).
- **Etiquetas de tipo:** `debit → "Débito"`, `credit → "Crédito"`, `investment → "Inversión"`.
- **Fila de lista:** `nombre` + subtexto `tipo · banco` (banco omitido si es null).
- **`useAccounts()` (selectores de Registro/Import) queda intacto** — solo trae activas.
- **Invalidación:** basta `invalidateQueries({ queryKey: ['accounts'] })` — react-query hace match por prefijo, así que cubre también `['accounts', 'manage']`.
- **Sin unicidad de nombre** (se permiten nombres repetidos).
- **Fuera de alcance:** ciclos de facturación / `bice_config` / SLRD (eso es sub-proyecto B/C).
- **Commits:** Conventional Commits, en español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Estándares:** clean-code-standards (guard clauses, SRP, nombres reveladores, inmutabilidad).

## File Structure

- `src/data/types.ts` (modificar) — agrega `ManagedAccount` y `AccountInput`.
- `src/data/useAccounts.ts` (modificar) — agrega `useManageAccounts`, `useSaveAccount`, `useSetAccountActive`.
- `src/features/ajustes/AccountSheet.tsx` (crear) — formulario crear/editar.
- `src/features/ajustes/AccountSheet.test.tsx` (crear).
- `src/features/ajustes/AccountsSection.tsx` (crear) — lista + wiring del sheet.
- `src/features/ajustes/AccountsSection.test.tsx` (crear).
- `src/features/ajustes/AjustesScreen.tsx` (modificar) — monta `<AccountsSection />`.

---

### Task 1: Capa de datos — tipos + hooks de cuentas

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/useAccounts.ts`

**Interfaces:**
- Consumes: tabla `accounts` (`id, name, type, bank, is_active, user_id`), tipos `Account`, `AccountType`.
- Produces:
  - `interface ManagedAccount { id: string; name: string; type: AccountType; bank: string | null; isActive: boolean }`
  - `interface AccountInput { id?: string; name: string; type: AccountType; bank: string | null }`
  - `useManageAccounts(): UseQueryResult<ManagedAccount[]>` — todas las cuentas; activas primero (orden de tipo), luego inactivas. `queryKey: ['accounts', 'manage']`.
  - `useSaveAccount(): UseMutationResult<void, Error, AccountInput>` — crear inserta `{name,type,bank}`; editar (con `id`) actualiza solo `{name,bank}`.
  - `useSetAccountActive(): UseMutationResult<void, Error, { id: string; isActive: boolean }>`.

Sin test unitario: los hooks de datos siguen el patrón de `useCategories.ts` (sin test propio; se validan vía los tests de la Sección y el build).

- [ ] **Step 1: Agregar los tipos**

En `src/data/types.ts`, inmediatamente después de la interface `Account` (la que tiene `id/name/type/bank`), agregar:

```ts
export interface ManagedAccount {
  id: string
  name: string
  type: AccountType
  bank: string | null
  isActive: boolean
}

export interface AccountInput {
  id?: string
  name: string
  type: AccountType
  bank: string | null
}
```

- [ ] **Step 2: Reescribir `useAccounts.ts` con los hooks nuevos**

Reemplazar el contenido completo de `src/data/useAccounts.ts` por:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Account, AccountType, ManagedAccount, AccountInput } from './types'

// BICE (credit) primero para que sea el default del registro.
const ORDER: Record<AccountType, number> = { credit: 0, debit: 1, investment: 2 }

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('accounts').select('id, name, type, bank').eq('is_active', true)
      if (error) throw error
      return (data as Account[]).sort((a, b) => ORDER[a.type] - ORDER[b.type])
    },
  })
}

export function useManageAccounts() {
  return useQuery({
    queryKey: ['accounts', 'manage'],
    queryFn: async (): Promise<ManagedAccount[]> => {
      const { data, error } = await supabase
        .from('accounts').select('id, name, type, bank, is_active')
      if (error) throw error
      const rows = data as Array<{
        id: string; name: string; type: AccountType; bank: string | null; is_active: boolean
      }>
      const mapped: ManagedAccount[] = rows.map((r) => ({
        id: r.id, name: r.name, type: r.type, bank: r.bank, isActive: r.is_active,
      }))
      // Activas primero (por orden de tipo), luego inactivas.
      return mapped.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return ORDER[a.type] - ORDER[b.type]
      })
    },
  })
}

export function useSaveAccount() {
  const qc = useQueryClient()
  return useMutation<void, Error, AccountInput>({
    mutationFn: async (a) => {
      // Al editar (id presente) el tipo es fijo: solo se actualizan name y bank.
      const row = a.id
        ? { id: a.id, name: a.name, bank: a.bank }
        : { name: a.name, type: a.type, bank: a.bank }
      const { error } = await supabase.from('accounts').upsert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useSetAccountActive() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase.from('accounts').update({ is_active: isActive }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: build OK, sin errores de TypeScript. (Si falla por tipos de `db.ts`, regenerar tipos — ver memoria del proyecto.)

- [ ] **Step 4: Commit**

```bash
git add src/data/types.ts src/data/useAccounts.ts
git commit -m "feat(cuentas): hooks useManageAccounts/useSaveAccount/useSetAccountActive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `AccountSheet` — formulario crear/editar

**Files:**
- Create: `src/features/ajustes/AccountSheet.tsx`
- Test: `src/features/ajustes/AccountSheet.test.tsx`

**Interfaces:**
- Consumes: `useSaveAccount` (Task 1), tipos `AccountType`/`ManagedAccount`, `BottomSheet` (`../../components/ui/BottomSheet`).
- Produces: `AccountSheet({ open, initial, onClose }: { open: boolean; initial: ManagedAccount | null; onClose: () => void })`. Al crear envía `{ name, type, bank }`; al editar el tipo no es editable (no se muestra el selector).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/features/ajustes/AccountSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSheet } from './AccountSheet'

vi.mock('../../data/useAccounts')
import { useSaveAccount } from '../../data/useAccounts'
import type { ManagedAccount } from '../../data/types'

const mutate = vi.fn()
beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useSaveAccount).mockReturnValue({ mutate, isPending: false, isError: false, reset: vi.fn() } as any)
})

const credit: ManagedAccount = { id: 'a1', name: 'BICE Visa', type: 'credit', bank: 'BICE', isActive: true }

describe('AccountSheet', () => {
  it('should_SendCreatePayload_When_NewAccountSaved', async () => {
    const user = userEvent.setup()
    render(<AccountSheet open initial={null} onClose={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/nombre/i), 'Falabella')
    await user.click(screen.getByRole('button', { name: /^crédito$/i }))
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))

    expect(mutate).toHaveBeenCalledWith(
      { name: 'Falabella', type: 'credit', bank: null }, expect.anything(),
    )
  })

  it('should_LockType_When_Editing', () => {
    render(<AccountSheet open initial={credit} onClose={vi.fn()} />)

    expect(screen.getByText(/Tipo:/i)).toBeInTheDocument()
    expect(screen.getByText(/Crédito/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^débito$/i })).not.toBeInTheDocument()
  })

  it('should_DisableSave_When_NameEmpty', () => {
    render(<AccountSheet open initial={null} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^guardar$/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/features/ajustes/AccountSheet.test.tsx`
Expected: FAIL — módulo `./AccountSheet` no existe.

- [ ] **Step 3: Implementar `AccountSheet.tsx`**

Crear `src/features/ajustes/AccountSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSaveAccount } from '../../data/useAccounts'
import type { AccountType, ManagedAccount } from '../../data/types'

const TYPE_LABEL: Record<AccountType, string> = {
  debit: 'Débito', credit: 'Crédito', investment: 'Inversión',
}
const TYPE_OPTIONS: AccountType[] = ['debit', 'credit', 'investment']

interface Props { open: boolean; initial: ManagedAccount | null; onClose: () => void }

export function AccountSheet({ open, initial, onClose }: Props) {
  const save = useSaveAccount()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('debit')
  const [bank, setBank] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setType(initial?.type ?? 'debit')
    setBank(initial?.bank ?? '')
    save.reset()
  }, [open, initial])

  const canSave = name.trim().length > 0 && !save.isPending

  function submit() {
    const trimmedBank = bank.trim()
    save.mutate(
      {
        ...(initial ? { id: initial.id } : {}),
        name: name.trim(),
        type,
        bank: trimmedBank === '' ? null : trimmedBank,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title={initial ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: BICE Visa)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />

        {initial ? (
          <p className="text-sm text-zinc-400">Tipo: <span className="text-zinc-200">{TYPE_LABEL[type]}</span></p>
        ) : (
          <div className="flex gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
                  type === t ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
                }`}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Banco (ej: BICE)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />

        {save.isError && <p className="text-debt text-sm">No se pudo guardar. Reintentá.</p>}

        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/features/ajustes/AccountSheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/ajustes/AccountSheet.tsx src/features/ajustes/AccountSheet.test.tsx
git commit -m "feat(cuentas): AccountSheet para crear/editar cuenta con tipo fijo al editar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `AccountsSection` + wiring en Ajustes

**Files:**
- Create: `src/features/ajustes/AccountsSection.tsx`
- Test: `src/features/ajustes/AccountsSection.test.tsx`
- Modify: `src/features/ajustes/AjustesScreen.tsx`

**Interfaces:**
- Consumes: `useManageAccounts`/`useSetAccountActive` (Task 1), `AccountSheet` (Task 2), tipos `AccountType`/`ManagedAccount`, `Skeleton`, iconos `Plus`/`Trash`.
- Produces: `AccountsSection()` — sección de Ajustes con lista de activas (editar + desactivar con confirmación) e inactivas (reactivar).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/features/ajustes/AccountsSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountsSection } from './AccountsSection'

vi.mock('../../data/useAccounts')
import { useManageAccounts, useSetAccountActive, useSaveAccount } from '../../data/useAccounts'
import type { ManagedAccount } from '../../data/types'

const ACCOUNTS: ManagedAccount[] = [
  { id: 'a1', name: 'BICE Visa', type: 'credit', bank: 'BICE', isActive: true },
  { id: 'a2', name: 'Cuenta vieja', type: 'debit', bank: null, isActive: false },
]

const setActive = vi.fn()
beforeEach(() => {
  setActive.mockReset()
  vi.mocked(useManageAccounts).mockReturnValue({ data: ACCOUNTS, isLoading: false, isError: false } as any)
  vi.mocked(useSetAccountActive).mockReturnValue({ mutate: setActive, isError: false } as any)
  vi.mocked(useSaveAccount).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() } as any)
})

describe('AccountsSection', () => {
  it('should_ListActiveAndInactive_When_Present', () => {
    render(<AccountsSection />)
    expect(screen.getByText('BICE Visa')).toBeInTheDocument()
    expect(screen.getByText('Cuenta vieja')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reactivar/i })).toBeInTheDocument()
  })

  it('should_ConfirmBeforeDeactivate_When_TrashClicked', async () => {
    const user = userEvent.setup()
    render(<AccountsSection />)
    await user.click(screen.getByRole('button', { name: /desactivar bice visa/i }))
    expect(setActive).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^sí$/i }))
    expect(setActive).toHaveBeenCalledWith({ id: 'a1', isActive: false })
  })

  it('should_Reactivate_When_ReactivarClicked', async () => {
    const user = userEvent.setup()
    render(<AccountsSection />)
    await user.click(screen.getByRole('button', { name: /reactivar/i }))
    expect(setActive).toHaveBeenCalledWith({ id: 'a2', isActive: true })
  })

  it('should_OpenSheet_When_AgregarClicked', async () => {
    const user = userEvent.setup()
    render(<AccountsSection />)
    await user.click(screen.getByRole('button', { name: /agregar cuenta/i }))
    expect(screen.getByText(/nueva cuenta/i)).toBeInTheDocument()
  })

  it('should_ShowEmpty_When_NoAccounts', () => {
    vi.mocked(useManageAccounts).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<AccountsSection />)
    expect(screen.getByText(/no tenés cuentas/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/features/ajustes/AccountsSection.test.tsx`
Expected: FAIL — módulo `./AccountsSection` no existe.

- [ ] **Step 3: Implementar `AccountsSection.tsx`**

Crear `src/features/ajustes/AccountsSection.tsx`:

```tsx
import { useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Skeleton } from '../../components/ui/Skeleton'
import { useManageAccounts, useSetAccountActive } from '../../data/useAccounts'
import { AccountSheet } from './AccountSheet'
import type { AccountType, ManagedAccount } from '../../data/types'

const TYPE_LABEL: Record<AccountType, string> = {
  debit: 'Débito', credit: 'Crédito', investment: 'Inversión',
}

function accountMeta(a: ManagedAccount): string {
  return [TYPE_LABEL[a.type], a.bank].filter(Boolean).join(' · ')
}

export function AccountsSection() {
  const accounts = useManageAccounts()
  const setActive = useSetAccountActive()
  const [editing, setEditing] = useState<ManagedAccount | null | 'new'>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const all = accounts.data ?? []
  const active = all.filter((a) => a.isActive)
  const inactive = all.filter((a) => !a.isActive)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">cuentas</p>
        <button onClick={() => setEditing('new')} aria-label="Agregar cuenta"
          className="flex items-center gap-1 text-sm text-accent-bright active:scale-[0.98]">
          <Plus size={16} weight="bold" /> Agregar
        </button>
      </div>

      {accounts.isLoading && <Skeleton className="h-16 w-full mt-3" />}

      {accounts.isError && (
        <div className="mt-3">
          <p className="text-debt text-sm">No se pudieron cargar. Reintentá.</p>
          <button onClick={() => accounts.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Reintentar</button>
        </div>
      )}

      {setActive.isError && <p className="text-debt text-sm mt-3">No se pudo actualizar. Reintentá.</p>}

      {accounts.data && all.length === 0 && (
        <p className="text-sm text-zinc-500 mt-3">No tenés cuentas. Agregá la primera.</p>
      )}

      <div className="mt-2">
        {active.map((a) => (
          <div key={a.id} className="py-3 border-t border-ink-line flex items-center justify-between">
            <button onClick={() => setEditing(a)} className="text-left">
              <span className="text-sm text-zinc-200">{a.name}</span>
              <span className="block text-[11px] text-zinc-500">{accountMeta(a)}</span>
            </button>
            {confirmingId === a.id ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-zinc-400">¿Desactivar?</span>
                <button onClick={() => { setActive.mutate({ id: a.id, isActive: false }); setConfirmingId(null) }}
                  className="text-debt active:scale-[0.98]">Sí</button>
                <button onClick={() => setConfirmingId(null)}
                  className="text-zinc-400 active:scale-[0.98]">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmingId(a.id)} aria-label={`Desactivar ${a.name}`}
                className="text-zinc-500 active:scale-[0.9]">
                <Trash size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {inactive.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-700">inactivas</p>
          <div className="mt-1">
            {inactive.map((a) => (
              <div key={a.id} className="py-3 border-t border-ink-line flex items-center justify-between opacity-50">
                <div>
                  <span className="text-sm text-zinc-300">{a.name}</span>
                  <span className="block text-[11px] text-zinc-500">{accountMeta(a)}</span>
                </div>
                <button onClick={() => setActive.mutate({ id: a.id, isActive: true })}
                  className="text-accent-bright text-sm active:scale-[0.98]">Reactivar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AccountSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/features/ajustes/AccountsSection.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Enchufar la sección en Ajustes**

En `src/features/ajustes/AjustesScreen.tsx`, agregar el import y montar la sección arriba de `<BiceConfigSection />`:

```tsx
import { Link } from 'react-router-dom'
import { SubscriptionsSection } from './SubscriptionsSection'
import { CategoriesSection } from './CategoriesSection'
import { AccountsSection } from './AccountsSection'
import { BiceConfigSection } from './BiceConfigSection'
import { FreshnessSection } from './FreshnessSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ajustes</p>
      <Link to="/importar"
        className="bg-ink-2 border border-ink-line rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]">
        <span className="text-sm text-zinc-200">Importar movimientos (BICE Visa o Santander)</span>
        <span className="text-accent-bright text-sm">Importar</span>
      </Link>
      <SubscriptionsSection />
      <CategoriesSection />
      <AccountsSection />
      <BiceConfigSection />
      <FreshnessSection />
    </section>
  )
}
```

- [ ] **Step 6: Correr toda la suite + build**

Run: `npx vitest run && npm run build`
Expected: todos los tests verdes, build OK.

- [ ] **Step 7: Commit**

```bash
git add src/features/ajustes/AccountsSection.tsx src/features/ajustes/AccountsSection.test.tsx src/features/ajustes/AjustesScreen.tsx
git commit -m "feat(cuentas): AccountsSection con activar/desactivar y wiring en Ajustes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (post-implementación)

Levantar la app (`mibanko-dev`, port 5173 — CONECTA A PRODUCCIÓN, no crear data basura) y abrir Ajustes → sección "cuentas". Confirmar:

1. Se listan las cuentas existentes (BICE, Santander) con su tipo y banco.
2. "Agregar" abre el sheet; crear una cuenta de prueba la agrega a la lista (luego desactivarla para no dejar basura, o borrarla a mano desde Supabase).
3. Editar una cuenta muestra el tipo fijo (sin selector) y permite cambiar nombre/banco.
4. Desactivar pide confirmación, mueve la cuenta a "inactivas" y la saca del selector de Registro. Reactivar la devuelve.
```
