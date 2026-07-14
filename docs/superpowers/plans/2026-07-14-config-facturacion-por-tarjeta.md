# Config de facturación por tarjeta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la config de facturación única (`bice_config`) por una config por tarjeta de crédito (`card_billing_config`), con editor por-tarjeta en Ajustes, manteniendo el cierre de ciclo funcionando sobre la tarjeta principal.

**Architecture:** Tabla nueva `card_billing_config` (account_id → cierre/vencimiento) migrada desde `bice_config`. Hooks nuevos + una función pura `pickPrimaryCardConfig` que elige la tarjeta principal (primera de crédito) para alimentar el cierre transitorio. UI: `CardCyclesSection` (Ajustes, lista por tarjeta) + `CardCycleSheet` (editor por tarjeta); `CicloScreen` se repunta a la config de la principal. Al final se elimina `bice_config` y el código muerto.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Supabase (Postgres + RLS), Vitest + Testing Library.

## Global Constraints

- **Esquema:** tabla `card_billing_config(account_id uuid PK → accounts.id ON DELETE CASCADE, closing_day int CHECK 1..28, due_day int CHECK 1..28, updated_at, user_id default auth.uid())`, RLS `user_id = auth.uid()` (mismo patrón que `budgets`).
- **`closing_day`/`due_day` en 1..28** (validación en UI y CHECK en DB).
- **Tarjeta principal = primera cuenta `type='credit'`** en el orden de `useAccounts()`. Alimenta el cierre de ciclo transitorio; el comportamiento del motor no cambia en B.
- **`bice_config` se elimina** al final, una vez migrada y sin consumidores.
- **Renombres:** `BiceConfigSection` → `CardCyclesSection`; `BiceConfigSheet` → `CardCycleSheet`.
- **`deriveCycleDates` y `BiceConfig` NO cambian** (siguen usándose en el cierre).
- **Invalidación:** `invalidateQueries({ queryKey: ['card-billing-config'] })` al guardar.
- **Migraciones:** las corre el **controller** (gate humano + MCP de Supabase), no un subagente. Tras cada migración, regenerar `src/types/db.ts` (o el build se rompe en silencio — memoria del proyecto).
- **Commits:** Conventional Commits, español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Estándares:** clean-code-standards (SRP datos/UI, funciones puras testeables, nombres reveladores).

## File Structure

- **DB:** tabla `card_billing_config` (crear), `bice_config` (dropear al final).
- `src/data/types.ts` (modificar) — agrega `CardBillingConfig`.
- `src/data/primaryCard.ts` (crear) — función pura `pickPrimaryCardConfig`.
- `src/data/primaryCard.test.ts` (crear).
- `src/data/useCardBillingConfig.ts` (crear) — `useCardBillingConfigs`, `useSaveCardBillingConfig`, `usePrimaryCardConfig`.
- `src/data/useBiceConfig.ts` (eliminar al final).
- `src/components/CardCycleSheet.tsx` (crear) + `.test.tsx`; `src/components/BiceConfigSheet.tsx` (eliminar).
- `src/features/ajustes/CardCyclesSection.tsx` (crear) + `.test.tsx`; `src/features/ajustes/BiceConfigSection.tsx` (eliminar).
- `src/features/ajustes/AjustesScreen.tsx` (modificar).
- `src/features/ciclo/CicloScreen.tsx` (modificar).

---

### Task 1: Migración — crear `card_billing_config` y migrar datos (controller-run)

**Files:** DB (Supabase) + `src/types/db.ts` (regenerado).

**Interfaces / Produces:** tabla `card_billing_config` poblada con la config de la tarjeta principal; `bice_config` **se conserva** por ahora.

- [ ] **Step 1: Crear la tabla y migrar datos** (controller, MCP `apply_migration`)

```sql
create table card_billing_config (
  account_id  uuid primary key references accounts(id) on delete cascade,
  closing_day int not null check (closing_day between 1 and 28),
  due_day     int not null check (due_day between 1 and 28),
  updated_at  timestamptz not null default now(),
  user_id     uuid not null default auth.uid()
);
alter table card_billing_config enable row level security;
create policy card_billing_config_own on card_billing_config
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into card_billing_config (account_id, closing_day, due_day, user_id)
select a.id, b.closing_day, b.due_day, a.user_id
from accounts a cross join bice_config b
where a.type = 'credit';
```

- [ ] **Step 2: Verificar la migración** (controller, MCP `execute_sql`)

```sql
select count(*) from accounts where type = 'credit';           -- esperado: 1
select * from card_billing_config;                             -- esperado: 1 fila con los días de bice_config
```
Si `type='credit'` devuelve más de 1, DETENER y escalar (la migración asume una sola tarjeta de crédito).

- [ ] **Step 3: Regenerar tipos** (controller, MCP `generate_typescript_types`)

Regenerar `src/types/db.ts`. Run: `npm run build` → build OK (nadie referencia la tabla nueva aún; `bice_config` sigue existiendo).

- [ ] **Step 4: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(tarjetas): tabla card_billing_config migrada desde bice_config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Capa de datos — hooks + función pura de tarjeta principal

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/primaryCard.ts`, `src/data/primaryCard.test.ts`
- Create: `src/data/useCardBillingConfig.ts`

**Interfaces:**
- Consumes: tabla `card_billing_config`, `useAccounts()` (de `./useAccounts`), tipos `Account`/`BiceConfig`.
- Produces:
  - `interface CardBillingConfig { accountId: string; closingDay: number; dueDay: number }`
  - `pickPrimaryCardConfig(accounts: Account[], configs: CardBillingConfig[]): { accountId: string | null; config: BiceConfig | null }`
  - `useCardBillingConfigs(): UseQueryResult<CardBillingConfig[]>` — `queryKey: ['card-billing-config']`
  - `useSaveCardBillingConfig(): UseMutationResult<void, Error, CardBillingConfig>`
  - `usePrimaryCardConfig(): { accountId: string | null; config: BiceConfig | null; isLoading: boolean }`

- [ ] **Step 1: Agregar el tipo**

En `src/data/types.ts`, después de `export interface BiceConfig { closingDay: number; dueDay: number }`, agregar:

```ts
export interface CardBillingConfig {
  accountId: string
  closingDay: number
  dueDay: number
}
```

- [ ] **Step 2: Escribir el test de `pickPrimaryCardConfig`**

Crear `src/data/primaryCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickPrimaryCardConfig } from './primaryCard'
import type { Account, CardBillingConfig } from './types'

const bice: Account = { id: 'a1', name: 'BICE Visa', type: 'credit', bank: 'BICE' }
const debit: Account = { id: 'a2', name: 'Santander', type: 'debit', bank: 'Santander' }
const cfg: CardBillingConfig = { accountId: 'a1', closingDay: 5, dueDay: 20 }

describe('pickPrimaryCardConfig', () => {
  it('should_ReturnFirstCreditConfig_When_Configured', () => {
    expect(pickPrimaryCardConfig([debit, bice], [cfg])).toEqual({
      accountId: 'a1', config: { closingDay: 5, dueDay: 20 },
    })
  })

  it('should_ReturnNullConfig_When_CreditCardNotConfigured', () => {
    expect(pickPrimaryCardConfig([bice], [])).toEqual({ accountId: 'a1', config: null })
  })

  it('should_ReturnNullAccount_When_NoCreditCard', () => {
    expect(pickPrimaryCardConfig([debit], [cfg])).toEqual({ accountId: null, config: null })
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run src/data/primaryCard.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 4: Implementar la función pura**

Crear `src/data/primaryCard.ts`:

```ts
import type { Account, BiceConfig, CardBillingConfig } from './types'

// Tarjeta principal = primera cuenta de crédito del orden recibido. Alimenta el cierre transitorio.
export function pickPrimaryCardConfig(
  accounts: Account[],
  configs: CardBillingConfig[],
): { accountId: string | null; config: BiceConfig | null } {
  const primary = accounts.find((a) => a.type === 'credit') ?? null
  if (!primary) return { accountId: null, config: null }
  const cfg = configs.find((c) => c.accountId === primary.id)
  return {
    accountId: primary.id,
    config: cfg ? { closingDay: cfg.closingDay, dueDay: cfg.dueDay } : null,
  }
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run src/data/primaryCard.test.ts` → PASS (3 tests).

- [ ] **Step 6: Crear los hooks**

Crear `src/data/useCardBillingConfig.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from './useAccounts'
import { pickPrimaryCardConfig } from './primaryCard'
import type { BiceConfig, CardBillingConfig } from './types'

export function useCardBillingConfigs() {
  return useQuery({
    queryKey: ['card-billing-config'],
    queryFn: async (): Promise<CardBillingConfig[]> => {
      const { data, error } = await supabase
        .from('card_billing_config').select('account_id, closing_day, due_day')
      if (error) throw error
      const rows = data as Array<{ account_id: string; closing_day: number; due_day: number }>
      return rows.map((r) => ({ accountId: r.account_id, closingDay: r.closing_day, dueDay: r.due_day }))
    },
  })
}

export function useSaveCardBillingConfig() {
  const qc = useQueryClient()
  return useMutation<void, Error, CardBillingConfig>({
    mutationFn: async ({ accountId, closingDay, dueDay }) => {
      const { error } = await supabase.from('card_billing_config').upsert(
        { account_id: accountId, closing_day: closingDay, due_day: dueDay, updated_at: new Date().toISOString() },
        { onConflict: 'account_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-billing-config'] }),
  })
}

export function usePrimaryCardConfig(): { accountId: string | null; config: BiceConfig | null; isLoading: boolean } {
  const accounts = useAccounts()
  const configs = useCardBillingConfigs()
  const { accountId, config } = pickPrimaryCardConfig(accounts.data ?? [], configs.data ?? [])
  return { accountId, config, isLoading: accounts.isLoading || configs.isLoading }
}
```

- [ ] **Step 7: Verificar typecheck**

Run: `npm run build` → build OK.

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/primaryCard.ts src/data/primaryCard.test.ts src/data/useCardBillingConfig.ts
git commit -m "feat(tarjetas): hooks de card_billing_config + pickPrimaryCardConfig

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `CardCycleSheet` — editor de días por tarjeta

**Files:**
- Create: `src/components/CardCycleSheet.tsx`, `src/components/CardCycleSheet.test.tsx`

**Interfaces:**
- Consumes: `useSaveCardBillingConfig` (Task 2), `BottomSheet` (`./ui/BottomSheet`), tipo `BiceConfig`.
- Produces: `CardCycleSheet({ open, accountId, initial, onClose }: { open: boolean; accountId: string; initial: BiceConfig | null; onClose: () => void })`. Guarda `{ accountId, closingDay, dueDay }`; Guardar deshabilitado si algún día no está en 1..28.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/components/CardCycleSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardCycleSheet } from './CardCycleSheet'

vi.mock('../data/useCardBillingConfig')
import { useSaveCardBillingConfig } from '../data/useCardBillingConfig'

const mutate = vi.fn()
beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useSaveCardBillingConfig).mockReturnValue({ mutate, isPending: false, isError: false } as any)
})

describe('CardCycleSheet', () => {
  it('should_SavePerAccount_When_DaysValid', async () => {
    const user = userEvent.setup()
    render(<CardCycleSheet open accountId="a1" initial={null} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText(/día de corte/i), '5')
    await user.type(screen.getByLabelText(/día de vencimiento/i), '20')
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))

    expect(mutate).toHaveBeenCalledWith({ accountId: 'a1', closingDay: 5, dueDay: 20 }, expect.anything())
  })

  it('should_DisableSave_When_DayOutOfRange', async () => {
    const user = userEvent.setup()
    render(<CardCycleSheet open accountId="a1" initial={null} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText(/día de corte/i), '40')
    await user.type(screen.getByLabelText(/día de vencimiento/i), '20')

    expect(screen.getByRole('button', { name: /^guardar$/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/components/CardCycleSheet.test.tsx` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `CardCycleSheet.tsx`**

Crear `src/components/CardCycleSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BottomSheet } from './ui/BottomSheet'
import { useSaveCardBillingConfig } from '../data/useCardBillingConfig'
import type { BiceConfig } from '../data/types'

interface Props { open: boolean; accountId: string; initial: BiceConfig | null; onClose: () => void }

function isValidDay(s: string): boolean {
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= 28
}

export function CardCycleSheet({ open, accountId, initial, onClose }: Props) {
  const save = useSaveCardBillingConfig()
  const [closingDay, setClosingDay] = useState('')
  const [dueDay, setDueDay] = useState('')

  useEffect(() => {
    if (!open) return
    setClosingDay(initial ? String(initial.closingDay) : '')
    setDueDay(initial ? String(initial.dueDay) : '')
    save.reset()
  }, [open, accountId, initial])

  const canSave = isValidDay(closingDay) && isValidDay(dueDay) && !save.isPending

  function submit() {
    save.mutate(
      { accountId, closingDay: Number(closingDay), dueDay: Number(dueDay) },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title="Fechas de la tarjeta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de corte (1–28)
          <input inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de vencimiento (1–28)
          <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        {save.isError && <p className="text-debt text-sm">No se pudo guardar.</p>}
        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/components/CardCycleSheet.test.tsx` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CardCycleSheet.tsx src/components/CardCycleSheet.test.tsx
git commit -m "feat(tarjetas): CardCycleSheet para editar corte/vencimiento por tarjeta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `CardCyclesSection` + wiring en Ajustes

**Files:**
- Create: `src/features/ajustes/CardCyclesSection.tsx`, `src/features/ajustes/CardCyclesSection.test.tsx`
- Modify: `src/features/ajustes/AjustesScreen.tsx`
- Delete: `src/features/ajustes/BiceConfigSection.tsx`

**Interfaces:**
- Consumes: `useAccounts` (`../../data/useAccounts`), `useCardBillingConfigs` (`../../data/useCardBillingConfig`), `CardCycleSheet` (`../../components/CardCycleSheet`), tipo `BiceConfig`.
- Produces: `CardCyclesSection()` — lista las cuentas de crédito con su config o "Sin configurar" y Editar por tarjeta.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/features/ajustes/CardCyclesSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardCyclesSection } from './CardCyclesSection'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useCardBillingConfig')
import { useAccounts } from '../../data/useAccounts'
import { useCardBillingConfigs, useSaveCardBillingConfig } from '../../data/useCardBillingConfig'

beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'a1', name: 'BICE Visa', type: 'credit', bank: 'BICE' },
    { id: 'a3', name: 'Falabella', type: 'credit', bank: 'Falabella' },
    { id: 'a2', name: 'Santander', type: 'debit', bank: 'Santander' },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useCardBillingConfigs).mockReturnValue({ data: [
    { accountId: 'a1', closingDay: 5, dueDay: 20 },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useSaveCardBillingConfig).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() } as any)
})

describe('CardCyclesSection', () => {
  it('should_ListCreditCardsWithConfigState', () => {
    render(<CardCyclesSection />)
    expect(screen.getByText('BICE Visa')).toBeInTheDocument()
    expect(screen.getByText(/Corte día 5 · Vence día 20/i)).toBeInTheDocument()
    expect(screen.getByText('Falabella')).toBeInTheDocument()
    expect(screen.getByText(/Sin configurar/i)).toBeInTheDocument()
    expect(screen.queryByText('Santander')).not.toBeInTheDocument()  // débito no aparece
  })

  it('should_OpenSheetPrefilled_When_EditingConfiguredCard', async () => {
    const user = userEvent.setup()
    render(<CardCyclesSection />)
    await user.click(screen.getAllByRole('button', { name: /editar/i })[0]) // BICE Visa (a1)
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/ajustes/CardCyclesSection.test.tsx` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `CardCyclesSection.tsx`**

Crear `src/features/ajustes/CardCyclesSection.tsx`:

```tsx
import { useState } from 'react'
import { Skeleton } from '../../components/ui/Skeleton'
import { CardCycleSheet } from '../../components/CardCycleSheet'
import { useAccounts } from '../../data/useAccounts'
import { useCardBillingConfigs } from '../../data/useCardBillingConfig'
import type { BiceConfig } from '../../data/types'

export function CardCyclesSection() {
  const accounts = useAccounts()
  const configs = useCardBillingConfigs()
  const [editing, setEditing] = useState<{ accountId: string; initial: BiceConfig | null } | null>(null)

  const creditCards = (accounts.data ?? []).filter((a) => a.type === 'credit')
  function configFor(id: string): BiceConfig | null {
    const c = (configs.data ?? []).find((x) => x.accountId === id)
    return c ? { closingDay: c.closingDay, dueDay: c.dueDay } : null
  }

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ciclos de tarjetas</p>

      {(accounts.isLoading || configs.isLoading) && <Skeleton className="h-16 w-full mt-3" />}

      {creditCards.length === 0 && !accounts.isLoading && (
        <p className="text-sm text-zinc-500 mt-3">No tenés tarjetas de crédito.</p>
      )}

      <div className="mt-2">
        {creditCards.map((card) => {
          const cfg = configFor(card.id)
          return (
            <div key={card.id} className="py-3 border-t border-ink-line flex items-center justify-between">
              <div>
                <span className="text-sm text-zinc-200">{card.name}</span>
                <span className="block text-[11px] text-zinc-500">
                  {cfg ? `Corte día ${cfg.closingDay} · Vence día ${cfg.dueDay}` : 'Sin configurar'}
                </span>
              </div>
              <button onClick={() => setEditing({ accountId: card.id, initial: cfg })}
                className="text-sm text-accent-bright active:scale-[0.98]">Editar</button>
            </div>
          )
        })}
      </div>

      <CardCycleSheet
        open={editing !== null}
        accountId={editing?.accountId ?? ''}
        initial={editing?.initial ?? null}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/ajustes/CardCyclesSection.test.tsx` → PASS (2 tests).

- [ ] **Step 5: Enchufar en Ajustes y borrar la sección vieja**

En `src/features/ajustes/AjustesScreen.tsx`: reemplazar el import y el uso de `BiceConfigSection` por `CardCyclesSection` (misma posición). Luego borrar `src/features/ajustes/BiceConfigSection.tsx`.

Import: `import { CardCyclesSection } from './CardCyclesSection'` (en vez de `BiceConfigSection`).
Uso: `<CardCyclesSection />` donde estaba `<BiceConfigSection />`.

```bash
git rm src/features/ajustes/BiceConfigSection.tsx
```

- [ ] **Step 6: Correr suite + build**

Run: `npx vitest run && npm run build` → verde. (Si `BiceConfigSection` tenía referencias, el build las marca; no debería quedar ninguna salvo `CicloScreen`, que se repunta en Task 5 — hasta entonces `CicloScreen` sigue usando `useBiceConfig`/`BiceConfigSheet`, que aún existen.)

- [ ] **Step 7: Commit**

```bash
git add src/features/ajustes/CardCyclesSection.tsx src/features/ajustes/CardCyclesSection.test.tsx src/features/ajustes/AjustesScreen.tsx
git commit -m "feat(tarjetas): CardCyclesSection en Ajustes (config por tarjeta), reemplaza BiceConfigSection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Repuntar `CicloScreen` a la tarjeta principal

**Files:**
- Modify: `src/features/ciclo/CicloScreen.tsx`

**Interfaces:**
- Consumes: `usePrimaryCardConfig` (Task 2), `CardCycleSheet` (Task 3). Deja de usar `useBiceConfig` y `BiceConfigSheet`.

- [ ] **Step 1: Repuntar el componente**

En `src/features/ciclo/CicloScreen.tsx`:

1) Imports: quitar `import { useBiceConfig } from '../../data/useBiceConfig'` y `import { BiceConfigSheet } from '../../components/BiceConfigSheet'`. Agregar:
```tsx
import { usePrimaryCardConfig } from '../../data/useCardBillingConfig'
import { CardCycleSheet } from '../../components/CardCycleSheet'
```

2) En el cuerpo, reemplazar `const config = useBiceConfig()` por:
```tsx
const { accountId, config, isLoading: configLoading } = usePrimaryCardConfig()
const hasConfig = !!config
```
(y eliminar el `const hasConfig = !!config.data` anterior).

3) Reemplazar los usos de `config.data`:
- El bloque `{!hasConfig && !config.isLoading && (...)}` → `{!hasConfig && !configLoading && (...)}`, y el texto a: `Configurá las fechas de la tarjeta para poder cerrar el ciclo.`
- La etiqueta del botón "Fechas BICE" → "Fechas".

4) Reemplazar el montaje de los sheets al final:
```tsx
{accountId && (
  <CardCycleSheet open={sheet === 'config'} accountId={accountId} initial={config} onClose={() => setSheet(null)} />
)}
{hasConfig && (
  <CloseCycleSheet open={sheet === 'close'} config={config!} onClose={() => setSheet(null)} onClosed={setDiff} />
)}
```

- [ ] **Step 2: Correr suite + build**

Run: `npx vitest run && npm run build`
Expected: verde. Si existe `CicloScreen.test.tsx` y mockeaba `useBiceConfig`, actualizar el mock a `usePrimaryCardConfig` (retorno `{ accountId, config, isLoading }`) en el mismo commit.

- [ ] **Step 3: Commit**

```bash
git add src/features/ciclo/CicloScreen.tsx
git commit -m "feat(tarjetas): CicloScreen usa la config de la tarjeta principal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Limpieza — eliminar código muerto y dropear `bice_config`

**Files:**
- Delete: `src/data/useBiceConfig.ts`, `src/components/BiceConfigSheet.tsx`
- DB: `drop table bice_config` + regen `src/types/db.ts` (controller-run)

- [ ] **Step 1: Confirmar que no quedan consumidores**

Run: `grep -rnE "useBiceConfig|BiceConfigSheet|bice_config" src/ | grep -v "\.test\." | grep -v types/db.ts`
Expected: sin resultados (todo repuntado en Tasks 4-5). Si aparece algo, repuntarlo antes de borrar.

- [ ] **Step 2: Borrar el código muerto**

```bash
git rm src/data/useBiceConfig.ts src/components/BiceConfigSheet.tsx
```

Run: `npx vitest run && npm run build` → verde (nada referencia lo borrado).

- [ ] **Step 3: Dropear la tabla** (controller, MCP `apply_migration`)

```sql
drop table bice_config;
```

- [ ] **Step 4: Regenerar tipos** (controller, MCP `generate_typescript_types`)

Regenerar `src/types/db.ts`. Run: `npm run build` → build OK (nadie referencia `bice_config`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(tarjetas): elimina bice_config y su código muerto (migrado a card_billing_config)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (post-implementación)

Levantar la app (`mibanko-dev`, port 5173 — CONECTA A PRODUCCIÓN) y confirmar:

1. Ajustes → "ciclos de tarjetas": aparece la tarjeta BICE con "Corte día X · Vence día Y" (migrado). Editar abre el sheet prellenado y guarda.
2. Si se agregó una 2ª tarjeta de crédito (vía A), aparece con "Sin configurar" y se le puede fijar su ciclo.
3. Ciclo: la pantalla de ciclo sigue funcionando igual (cierre usa la config de la tarjeta principal). El botón "Fechas" abre el editor de la principal.
4. `bice_config` ya no existe en la DB; el build queda verde con los tipos regenerados.
```
