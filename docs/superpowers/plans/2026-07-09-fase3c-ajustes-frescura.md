# Sub-fase 3c — Ajustes completo + frescura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar la pantalla Ajustes con CRUD de categorías y edición de fechas BICE, y potenciar los avisos de frescura del dashboard (banner accionable + SLRD marcado + umbral configurable persistido en DB).

**Architecture:** Una tabla nueva `user_settings` (singleton por usuaria) guarda el umbral de frescura. La capa de datos suma hooks de categorías (`useSaveCategory`/`useDeleteCategory`) y de settings (`useUserSettings`/`useSaveUserSettings`) más un helper puro `isStale`. La UI extiende `AjustesScreen` con tres secciones nuevas (Categorías, Ciclo BICE, Frescura) reutilizando `BiceConfigSheet` movido a un lugar compartido, y el `DashboardScreen` reemplaza su constante fija por el umbral configurable.

**Tech Stack:** Supabase (Postgres), React + Vite + TypeScript, TanStack Query, Tailwind, Vitest + Testing Library. La migración se aplica al proyecto remoto `feljshqybemysbokqedp` vía el MCP de Supabase (`apply_migration` / `execute_sql`).

## Global Constraints

- **Sin `Co-Authored-By` ni trailers de co-autoría de IA en ningún commit.**
- Ningún componente llama `supabase-js` directo — siempre vía hooks en `src/data/`.
- Categorías **name-only** (sin color ni ícono).
- Borrar una categoría es seguro por `on delete set null`: solo desvincula, no borra transacciones/suscripciones.
- `user_settings.fresh_limit_days` con `check between 1 and 60`, default **4**. El input de umbral en Ajustes clampa a 1–60.
- Días de BICE clampados a 1–28 (ya vigente en `BiceConfigSheet`).
- Tests de lógica pura en `.test.ts`; tests de componente en `.test.tsx`.
- `userEvent`: usar `const user = userEvent.setup()` + `await user.click(...)`.
- Estados obligatorios en toda sección: loading (skeleton), empty (texto tranquilo), error (inline + retry).
- Migración nueva `supabase/migrations/0006_user_settings.sql`; aplicar el **mismo** SQL al remoto vía `apply_migration` con nombre `0006_user_settings`.

---

## File Structure

**SQL**
- Create `supabase/migrations/0006_user_settings.sql` — tabla `user_settings` + RLS owner.

**Data layer**
- Modify `src/data/types.ts` — interfaz `UserSettings`.
- Create `src/data/freshness.ts` — helper puro `isStale`.
- Create `src/data/useUserSettings.ts` — `mapSettingsRow`, `useUserSettings`, `useSaveUserSettings`.
- Modify `src/data/useCategories.ts` — `useSaveCategory`, `useDeleteCategory`.

**UI**
- Move `src/features/ciclo/BiceConfigSheet.tsx` → `src/components/BiceConfigSheet.tsx` (arreglar imports internos + el import en `CicloScreen`).
- Create `src/features/ajustes/CategorySheet.tsx` — `BottomSheet` de alta/edición (un campo).
- Create `src/features/ajustes/CategoriesSection.tsx` — lista + confirmar-borrar + sheet.
- Create `src/features/ajustes/BiceConfigSection.tsx` — muestra/edita fechas BICE.
- Create `src/features/ajustes/FreshnessSection.tsx` — edita el umbral.
- Modify `src/features/ajustes/AjustesScreen.tsx` — monta las tres secciones nuevas.
- Modify `src/features/dashboard/DashboardScreen.tsx` — umbral configurable + `isStale` + banner + SLRD marcado.

**Tests**
- Create `src/data/freshness.test.ts` — `isStale`.
- Create `src/data/useUserSettings.test.ts` — `mapSettingsRow`.
- Create `src/features/ajustes/CategoriesSection.test.tsx` — lista/confirmar-borrar/empty.
- Create `src/features/ajustes/FreshnessSection.test.tsx` — guardar umbral.
- Modify `src/features/dashboard/DashboardScreen.test.tsx` — banner stale + no-banner fresco.

---

## Task 1: Tabla `user_settings`

**Files:**
- Create: `supabase/migrations/0006_user_settings.sql`

**Interfaces:**
- Produces: tabla `public.user_settings (user_id pk, fresh_limit_days int, updated_at)` con RLS `user_settings_owner`.

- [ ] **Step 1: Crear el archivo de migración**

Escribir `supabase/migrations/0006_user_settings.sql`:

```sql
-- Sub-fase 3c: preferencias de la usuaria. Singleton por usuaria (patrón bice_config).
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fresh_limit_days int not null default 4 check (fresh_limit_days between 1 and 60),
  updated_at       timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists user_settings_owner on public.user_settings;
create policy user_settings_owner on public.user_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar la migración al remoto**

Vía el MCP de Supabase, `apply_migration` con `name: "0006_user_settings"` y el SQL del Step 1.

- [ ] **Step 3: Verificar tabla + RLS**

Vía MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='user_settings' order by ordinal_position;
select polname from pg_policies where schemaname='public' and tablename='user_settings';
```
Esperado: columnas `user_id`(uuid), `fresh_limit_days`(integer), `updated_at`(timestamp with time zone); política `user_settings_owner`.

- [ ] **Step 4: Verificar el check 1–60 (rollback)**

Vía MCP `execute_sql`:

```sql
do $$
declare v_user uuid;
begin
  select user_id into v_user from public.accounts limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  begin
    insert into public.user_settings (user_id, fresh_limit_days) values (v_user, 61);
    raise exception 'FALLO: 61 no fue rechazado';
  exception when check_violation then
    raise notice 'OK: check 1..60 rechaza 61';
  end;
  raise exception 'ROLLBACK_INTENCIONAL';
end $$;
```
Esperado: termina con `ROLLBACK_INTENCIONAL` (no con `FALLO`), lo que confirma que el `check` rechazó 61.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_user_settings.sql
git commit -m "feat: tabla user_settings para preferencias de la usuaria"
```

---

## Task 2: Capa de datos de frescura (settings + `isStale`)

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/freshness.ts`
- Create: `src/data/useUserSettings.ts`
- Test: `src/data/freshness.test.ts`, `src/data/useUserSettings.test.ts`

**Interfaces:**
- Produces:
  - `UserSettings { freshLimitDays: number }`
  - `isStale(ageDays: number | null, limitDays: number): boolean`
  - `mapSettingsRow(row: { fresh_limit_days: number } | null): UserSettings`
  - `useUserSettings()` → `UseQueryResult<UserSettings>`; `useSaveUserSettings()` → mutación `UserSettings`.

- [ ] **Step 1: Agregar el tipo a `types.ts`**

Añadir a `src/data/types.ts` (después de `BiceConfig`, línea ~58):

```ts
export interface UserSettings { freshLimitDays: number }
```

- [ ] **Step 2: Escribir el test de `isStale`**

Crear `src/data/freshness.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isStale } from './freshness'

describe('isStale', () => {
  it('should_False_When_AgeNull', () => { expect(isStale(null, 4)).toBe(false) })
  it('should_False_When_AgeWithinLimit', () => { expect(isStale(4, 4)).toBe(false) })
  it('should_True_When_AgeOverLimit', () => { expect(isStale(5, 4)).toBe(true) })
})
```

- [ ] **Step 3: Escribir el test de `mapSettingsRow`**

Crear `src/data/useUserSettings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapSettingsRow } from './useUserSettings'

describe('mapSettingsRow', () => {
  it('should_Default4_When_NoRow', () => {
    expect(mapSettingsRow(null)).toEqual({ freshLimitDays: 4 })
  })
  it('should_MapValue_When_Row', () => {
    expect(mapSettingsRow({ fresh_limit_days: 10 })).toEqual({ freshLimitDays: 10 })
  })
})
```

- [ ] **Step 4: Correr los tests — deben fallar**

Run: `npx vitest run src/data/freshness.test.ts src/data/useUserSettings.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 5: Implementar `freshness.ts`**

Crear `src/data/freshness.ts`:

```ts
export function isStale(ageDays: number | null, limitDays: number): boolean {
  return ageDays != null && ageDays > limitDays
}
```

- [ ] **Step 6: Implementar `useUserSettings.ts`**

Crear `src/data/useUserSettings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserSettings } from './types'

const DEFAULT_FRESH_LIMIT_DAYS = 4

export function mapSettingsRow(row: { fresh_limit_days: number } | null): UserSettings {
  if (!row) return { freshLimitDays: DEFAULT_FRESH_LIMIT_DAYS }
  return { freshLimitDays: Number(row.fresh_limit_days) }
}

export function useUserSettings() {
  return useQuery({
    queryKey: ['user-settings'],
    queryFn: async (): Promise<UserSettings> => {
      const { data, error } = await supabase
        .from('user_settings').select('fresh_limit_days').maybeSingle()
      if (error) throw error
      return mapSettingsRow(data as { fresh_limit_days: number } | null)
    },
  })
}

export function useSaveUserSettings() {
  const qc = useQueryClient()
  return useMutation<void, Error, UserSettings>({
    mutationFn: async (s) => {
      const { error } = await supabase.from('user_settings').upsert(
        { fresh_limit_days: s.freshLimitDays, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  })
}
```

- [ ] **Step 7: Correr los tests — deben pasar**

Run: `npx vitest run src/data/freshness.test.ts src/data/useUserSettings.test.ts`
Expected: PASS (3 + 2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/freshness.ts src/data/useUserSettings.ts src/data/freshness.test.ts src/data/useUserSettings.test.ts
git commit -m "feat: capa de datos de frescura (user_settings + isStale)"
```

---

## Task 3: Mover `BiceConfigSheet` a compartido

**Files:**
- Move: `src/features/ciclo/BiceConfigSheet.tsx` → `src/components/BiceConfigSheet.tsx`
- Modify: `src/features/ciclo/CicloScreen.tsx` (import)

**Interfaces:**
- Produces: `BiceConfigSheet` importable desde `../../components/BiceConfigSheet` (props sin cambio: `{ open, initial, onClose }`).

- [ ] **Step 1: Mover el archivo con git**

```bash
git mv src/features/ciclo/BiceConfigSheet.tsx src/components/BiceConfigSheet.tsx
```

- [ ] **Step 2: Arreglar los imports internos del archivo movido**

En `src/components/BiceConfigSheet.tsx`, ajustar las rutas relativas (sube un nivel menos):

```tsx
import { BottomSheet } from './ui/BottomSheet'
import { useSaveBiceConfig } from '../data/useBiceConfig'
import type { BiceConfig } from '../data/types'
```
(reemplazan a `../../components/ui/BottomSheet`, `../../data/useBiceConfig`, `../../data/types`). El resto del componente no cambia.

- [ ] **Step 3: Arreglar el import en `CicloScreen`**

En `src/features/ciclo/CicloScreen.tsx`, cambiar la línea 6:

```tsx
import { BiceConfigSheet } from '../../components/BiceConfigSheet'
```
(reemplaza a `import { BiceConfigSheet } from './BiceConfigSheet'`).

- [ ] **Step 4: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; toda la suite en verde (el test del ciclo sigue pasando con el nuevo path).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: mueve BiceConfigSheet a components para compartir con ajustes"
```

---

## Task 4: Categorías — hooks CRUD + `CategorySheet` + `CategoriesSection`

**Files:**
- Modify: `src/data/useCategories.ts`
- Create: `src/features/ajustes/CategorySheet.tsx`
- Create: `src/features/ajustes/CategoriesSection.tsx`
- Test: `src/features/ajustes/CategoriesSection.test.tsx`

**Interfaces:**
- Consumes: `useCategories` (existente), `Category` (`{ id, name }`), `BottomSheet`, `Skeleton`, `@phosphor-icons/react`.
- Produces: `useSaveCategory()` (upsert `{ id?, name }`), `useDeleteCategory()` (borra por id); `CategorySheet({ open, initial, onClose })` con `initial: Category | null`; `CategoriesSection()`.

- [ ] **Step 1: Agregar los hooks a `useCategories.ts`**

En `src/data/useCategories.ts`, reemplazar la primera línea de import por:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
```
y añadir al final del archivo:

```ts
export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id?: string; name: string }>({
    mutationFn: async (c) => {
      const row = { ...(c.id ? { id: c.id } : {}), name: c.name }
      const { error } = await supabase.from('categories').upsert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
```

- [ ] **Step 2: Implementar `CategorySheet.tsx`**

Crear `src/features/ajustes/CategorySheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSaveCategory } from '../../data/useCategories'
import type { Category } from '../../data/types'

interface Props { open: boolean; initial: Category | null; onClose: () => void }

export function CategorySheet({ open, initial, onClose }: Props) {
  const save = useSaveCategory()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
  }, [open, initial])

  const canSave = name.trim().length > 0 && !save.isPending

  function submit() {
    save.mutate(
      { ...(initial ? { id: initial.id } : {}), name: name.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title={initial ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Comida)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />
        {save.isError && <p className="text-debt text-sm">Ya existe una categoría con ese nombre.</p>}
        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 3: Escribir el test de `CategoriesSection`**

Crear `src/features/ajustes/CategoriesSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoriesSection } from './CategoriesSection'

vi.mock('../../data/useCategories')
import { useCategories, useSaveCategory, useDeleteCategory } from '../../data/useCategories'

const del = vi.fn()
beforeEach(() => {
  del.mockReset()
  vi.mocked(useCategories).mockReturnValue({ data: [
    { id: 'c1', name: 'Comida' },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useSaveCategory).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  vi.mocked(useDeleteCategory).mockReturnValue({ mutate: del, isError: false } as any)
})

describe('CategoriesSection', () => {
  it('should_ListCategory_When_Present', () => {
    render(<CategoriesSection />)
    expect(screen.getByText('Comida')).toBeInTheDocument()
  })
  it('should_ConfirmBeforeDelete_When_TrashClicked', async () => {
    const user = userEvent.setup()
    render(<CategoriesSection />)
    await user.click(screen.getByRole('button', { name: /borrar comida/i }))
    expect(del).not.toHaveBeenCalled()               // primero pide confirmación
    await user.click(screen.getByRole('button', { name: /^sí$/i }))
    expect(del).toHaveBeenCalledWith('c1')
  })
  it('should_ShowEmpty_When_NoCategories', () => {
    vi.mocked(useCategories).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<CategoriesSection />)
    expect(screen.getByText(/no tenés categorías/i)).toBeInTheDocument()
  })
  it('should_ShowDuplicateError_When_SaveFails', async () => {
    const user = userEvent.setup()
    vi.mocked(useSaveCategory).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: true } as any)
    render(<CategoriesSection />)
    await user.click(screen.getByRole('button', { name: /agregar categoría/i }))
    expect(screen.getByText(/ya existe una categoría con ese nombre/i)).toBeInTheDocument()
  })
})
```

El último test abre el `CategorySheet` (botón "Agregar categoría") con `useSaveCategory` mockeado en `isError: true`, y verifica que el sheet muestra el copy de nombre duplicado del spec §6.1.

- [ ] **Step 4: Correr el test — debe fallar**

Run: `npx vitest run src/features/ajustes/CategoriesSection.test.tsx`
Expected: FAIL (componente no existe).

- [ ] **Step 5: Implementar `CategoriesSection.tsx`**

Crear `src/features/ajustes/CategoriesSection.tsx`:

```tsx
import { useState } from 'react'
import { Skeleton } from '../../components/ui/Skeleton'
import { Plus, Trash } from '@phosphor-icons/react'
import { useCategories, useDeleteCategory } from '../../data/useCategories'
import { CategorySheet } from './CategorySheet'
import type { Category } from '../../data/types'

export function CategoriesSection() {
  const cats = useCategories()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Category | null | 'new'>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">categorías</p>
        <button onClick={() => setEditing('new')} aria-label="Agregar categoría"
          className="flex items-center gap-1 text-sm text-accent-bright active:scale-[0.98]">
          <Plus size={16} weight="bold" /> Agregar
        </button>
      </div>

      {cats.isLoading && <Skeleton className="h-16 w-full mt-3" />}

      {cats.isError && (
        <div className="mt-3">
          <p className="text-debt text-sm">No se pudieron cargar. Reintentá.</p>
          <button onClick={() => cats.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Reintentar</button>
        </div>
      )}

      {del.isError && <p className="text-debt text-sm mt-3">No se pudo borrar. Reintentá.</p>}

      {cats.data && cats.data.length === 0 && (
        <p className="text-sm text-zinc-500 mt-3">No tenés categorías. Agregá la primera.</p>
      )}

      <div className="mt-2">
        {(cats.data ?? []).map((c) => (
          <div key={c.id} className="py-3 border-t border-ink-line flex items-center justify-between">
            <button onClick={() => setEditing(c)} className="text-left text-sm text-zinc-200">{c.name}</button>
            {confirmingId === c.id ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-zinc-400">¿Borrar?</span>
                <button onClick={() => { del.mutate(c.id); setConfirmingId(null) }}
                  className="text-debt active:scale-[0.98]">Sí</button>
                <button onClick={() => setConfirmingId(null)}
                  className="text-zinc-400 active:scale-[0.98]">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmingId(c.id)} aria-label={`Borrar ${c.name}`}
                className="text-zinc-500 active:scale-[0.9]">
                <Trash size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <CategorySheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
```

- [ ] **Step 6: Correr el test — debe pasar**

Run: `npx vitest run src/features/ajustes/CategoriesSection.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/data/useCategories.ts src/features/ajustes/CategorySheet.tsx src/features/ajustes/CategoriesSection.tsx src/features/ajustes/CategoriesSection.test.tsx
git commit -m "feat: crud de categorias en ajustes con confirmacion de borrado"
```

---

## Task 5: Secciones Ciclo BICE + Frescura + wire `AjustesScreen`

**Files:**
- Create: `src/features/ajustes/BiceConfigSection.tsx`
- Create: `src/features/ajustes/FreshnessSection.tsx`
- Modify: `src/features/ajustes/AjustesScreen.tsx`
- Test: `src/features/ajustes/FreshnessSection.test.tsx`

**Interfaces:**
- Consumes: `BiceConfigSheet` (Task 3, en `../../components/BiceConfigSheet`), `useBiceConfig` (existente), `useUserSettings`/`useSaveUserSettings` (Task 2), `SubscriptionsSection`/`CategoriesSection` (existentes).
- Produces: `BiceConfigSection()`, `FreshnessSection()`, `AjustesScreen` con las cuatro secciones.

- [ ] **Step 1: Implementar `BiceConfigSection.tsx`**

Crear `src/features/ajustes/BiceConfigSection.tsx`:

```tsx
import { useState } from 'react'
import { BiceConfigSheet } from '../../components/BiceConfigSheet'
import { useBiceConfig } from '../../data/useBiceConfig'

export function BiceConfigSection() {
  const config = useBiceConfig()
  const [open, setOpen] = useState(false)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ciclo bice</p>
        <button onClick={() => setOpen(true)} className="text-sm text-accent-bright active:scale-[0.98]">Editar</button>
      </div>
      <p className="text-sm text-zinc-300 mt-3">
        {config.data
          ? `Corte día ${config.data.closingDay} · Vence día ${config.data.dueDay}`
          : 'Sin configurar'}
      </p>
      <BiceConfigSheet open={open} initial={config.data ?? null} onClose={() => setOpen(false)} />
    </section>
  )
}
```

- [ ] **Step 2: Escribir el test de `FreshnessSection`**

Crear `src/features/ajustes/FreshnessSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreshnessSection } from './FreshnessSection'

vi.mock('../../data/useUserSettings')
import { useUserSettings, useSaveUserSettings } from '../../data/useUserSettings'

const save = vi.fn()
beforeEach(() => {
  save.mockReset()
  vi.mocked(useUserSettings).mockReturnValue({ data: { freshLimitDays: 4 } } as any)
  vi.mocked(useSaveUserSettings).mockReturnValue({ mutate: save, isPending: false, isError: false } as any)
})

describe('FreshnessSection', () => {
  it('should_SaveThreshold_When_GuardarClicked', async () => {
    const user = userEvent.setup()
    render(<FreshnessSection />)
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(screen.getByRole('button', { name: /guardar umbral/i }))
    expect(save).toHaveBeenCalledWith({ freshLimitDays: 10 })
  })
})
```

- [ ] **Step 3: Correr el test — debe fallar**

Run: `npx vitest run src/features/ajustes/FreshnessSection.test.tsx`
Expected: FAIL (componente no existe).

- [ ] **Step 4: Implementar `FreshnessSection.tsx`**

Crear `src/features/ajustes/FreshnessSection.tsx`:

```tsx
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
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">frescura</p>
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
```

- [ ] **Step 5: Correr el test — debe pasar**

Run: `npx vitest run src/features/ajustes/FreshnessSection.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Montar las secciones en `AjustesScreen`**

Reemplazar el contenido de `src/features/ajustes/AjustesScreen.tsx` por:

```tsx
import { SubscriptionsSection } from './SubscriptionsSection'
import { CategoriesSection } from './CategoriesSection'
import { BiceConfigSection } from './BiceConfigSection'
import { FreshnessSection } from './FreshnessSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ajustes</p>
      <SubscriptionsSection />
      <CategoriesSection />
      <BiceConfigSection />
      <FreshnessSection />
    </section>
  )
}
```

- [ ] **Step 7: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/features/ajustes/BiceConfigSection.tsx src/features/ajustes/FreshnessSection.tsx src/features/ajustes/FreshnessSection.test.tsx src/features/ajustes/AjustesScreen.tsx
git commit -m "feat: secciones ciclo bice y frescura en ajustes"
```

---

## Task 6: Dashboard — frescura avanzada

**Files:**
- Modify: `src/features/dashboard/DashboardScreen.tsx`
- Test: `src/features/dashboard/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `useUserSettings` (Task 2), `isStale` (Task 2), `useNavigate` (react-router-dom), `useSlrd`/`useLatestSnapshotAge` (existentes).

- [ ] **Step 1: Actualizar el test del dashboard**

En `src/features/dashboard/DashboardScreen.test.tsx`: (a) agregar los mocks de router y settings arriba, (b) el default de `useUserSettings` en `beforeEach`, y (c) los dos tests nuevos.

Reemplazar el bloque de imports/mocks superior (líneas 1–12) por:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardScreen } from './DashboardScreen'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../data/useSlrd')
vi.mock('../../data/useLatestSnapshotAge')
vi.mock('../../data/useUserSettings')
import { useSlrd } from '../../data/useSlrd'
import { useLatestSnapshotAge } from '../../data/useLatestSnapshotAge'
import { useUserSettings } from '../../data/useUserSettings'

const LOADED = {
  isLoading: false, isError: false,
  data: {
    slrdInmediato: 487320, slrdTotal: 2301540, saldoContable: 2514900,
    saldoDebito: 786220, saldoInversion: 1814220,
    deudaFacturada: 298900, deudaNoFacturada: 156400,
  },
}

beforeEach(() => {
  vi.mocked(useLatestSnapshotAge).mockReturnValue({ data: 2 } as any)
  vi.mocked(useUserSettings).mockReturnValue({ data: { freshLimitDays: 4 } } as any)
})
```

Luego, en el test `should_RenderHero_When_Loaded`, reemplazar el `mockReturnValue({ ...data... })` por `mockReturnValue(LOADED as any)` (el objeto de datos es idéntico al de `LOADED`). Y añadir, al final del `describe`, estos dos tests:

```tsx
  it('should_ShowStaleBannerAndMark_When_SnapshotOld', () => {
    vi.mocked(useLatestSnapshotAge).mockReturnValue({ data: 10 } as any)
    vi.mocked(useSlrd).mockReturnValue(LOADED as any)
    render(<DashboardScreen />)
    expect(screen.getByText(/puede estar desactualizado/i)).toBeInTheDocument()
    expect(screen.getByText(/estimado · snapshot viejo/i)).toBeInTheDocument()
    expect(screen.getByText(/snapshot hace 10 días/i)).toBeInTheDocument()
  })
  it('should_NotShowBanner_When_Fresh', () => {
    vi.mocked(useSlrd).mockReturnValue(LOADED as any)   // age 2, umbral 4 -> fresco
    render(<DashboardScreen />)
    expect(screen.queryByText(/puede estar desactualizado/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx vitest run src/features/dashboard/DashboardScreen.test.tsx`
Expected: FAIL (no existe el banner ni el texto "estimado · snapshot viejo"; y el dashboard aún no llama `useUserSettings`/`useNavigate`).

- [ ] **Step 3: Modificar `DashboardScreen.tsx`**

Reemplazar `src/features/dashboard/DashboardScreen.tsx` por:

```tsx
import { useNavigate } from 'react-router-dom'
import { useSlrd } from '../../data/useSlrd'
import { useLatestSnapshotAge } from '../../data/useLatestSnapshotAge'
import { useUserSettings } from '../../data/useUserSettings'
import { isStale } from '../../data/freshness'
import { CountUp } from '../../components/motion/CountUp'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { WarningCircle } from '@phosphor-icons/react'

export function DashboardScreen() {
  const nav = useNavigate()
  const slrd = useSlrd()
  const age = useLatestSnapshotAge()
  const settings = useUserSettings()
  const limit = settings.data?.freshLimitDays ?? 4
  const stale = isStale(age.data ?? null, limit)

  if (slrd.isLoading) {
    return (
      <section className="px-6 pt-10">
        <Skeleton className="h-3 w-32 mb-4" />
        <div data-testid="slrd-skeleton"><Skeleton className="h-14 w-56 mb-3" /></div>
        <Skeleton className="h-4 w-40" />
      </section>
    )
  }

  if (slrd.isError || !slrd.data) {
    return (
      <section className="px-6 pt-10">
        <p className="text-debt text-sm">No pudimos cargar tu saldo. Reintentá.</p>
        <button onClick={() => slrd.refetch()}
          className="mt-3 border border-ink-line rounded-lg px-4 py-2 text-sm active:scale-[0.98]">
          Reintentar
        </button>
      </section>
    )
  }

  const d = slrd.data
  const sinDatos = d.saldoDebito === 0 && d.saldoInversion === 0

  return (
    <section className="px-6 pt-8">
      <header className="flex items-center justify-between">
        <span className="text-[15px] text-zinc-400">Hola, Josefa</span>
        {age.data != null && (
          <span className={`text-[11px] px-2.5 py-1 ${stale
            ? 'text-[var(--fresh-warn)] border border-ink-line rounded-full'
            : 'text-zinc-500'}`}>
            {stale ? `snapshot hace ${age.data} días` : `hace ${age.data} días`}
          </span>
        )}
      </header>

      {stale && (
        <button onClick={() => nav('/snapshots')}
          className="mt-4 w-full text-left bg-ink-2 border border-ink-line rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]">
          <span className="text-sm text-zinc-300">Tu SLRD puede estar desactualizado — actualizá tus saldos</span>
          <span className="text-accent-bright text-sm">Actualizar</span>
        </button>
      )}

      {sinDatos ? (
        <div className="mt-16 text-center">
          <p className="text-lg mb-1">Todavía no hay saldos.</p>
          <p className="text-sm text-zinc-500">Cargá tu primer snapshot para ver el SLRD real.</p>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">disponible de verdad</p>
            <CountUp value={d.slrdInmediato}
              className={`block text-[46px] leading-none mt-1.5 ${stale ? 'text-zinc-500' : 'text-accent-bright'}`} />
            {stale && <p className="text-[11px] text-[var(--fresh-warn)] mt-1">estimado · snapshot viejo</p>}
            <div className="flex items-baseline gap-2 mt-2.5">
              <MoneyText value={d.saldoContable} className="text-base text-zinc-600 line-through decoration-debt" />
              <span className="text-xs text-zinc-600">lo que el banco te muestra</span>
            </div>
          </div>

          <div className="mt-6 py-3.5 border-t border-ink-line flex items-baseline justify-between">
            <span className="text-sm text-zinc-400">Con Fintual <span className="text-zinc-600">(total)</span></span>
            <MoneyText value={d.slrdTotal} className="text-[17px] text-zinc-200" />
          </div>

          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">deuda comprometida</p>
            <Row label="Facturado BICE" hint="pendiente de pago" amount={d.deudaFacturada} />
            <Row label="Ciclo actual" hint="sin facturar" amount={d.deudaNoFacturada} />
          </div>
        </>
      )}
    </section>
  )
}

function Row({ label, hint, amount }: { label: string; hint: string; amount: number }) {
  return (
    <div className="py-3.5 border-t border-ink-line flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-zinc-200">{label}</span>
        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
          <WarningCircle size={12} className="text-[var(--fresh-warn)]" />{hint}
        </span>
      </div>
      <MoneyText value={-amount} signed className="text-[15px] text-debt" />
    </div>
  )
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/features/dashboard/DashboardScreen.test.tsx`
Expected: PASS (5 tests: los 3 previos + 2 nuevos).

- [ ] **Step 5: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite verde.

- [ ] **Step 6: Commit**

```bash
git add src/features/dashboard/DashboardScreen.tsx src/features/dashboard/DashboardScreen.test.tsx
git commit -m "feat: frescura avanzada en dashboard (banner accionable, slrd marcado, umbral configurable)"
```

---

## Task 7: Verificación end-to-end + documentación

**Files:**
- Modify: `docs/plan-slrd.md` (marcar 3c completada, opcional)

- [ ] **Step 1: Suite completa + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: todo verde.

- [ ] **Step 2: Verificación manual contra Supabase real (navegador)**

`npm run dev`, login, ir a Ajustes:
- Crear/renombrar/borrar una categoría; verificar que una transacción vieja con esa categoría queda **sin categoría** (no se borra) tras borrarla.
- Editar fechas BICE desde Ajustes; verificar que Ciclo refleja el cambio.
- Bajar el umbral de frescura por debajo de la edad del último snapshot → volver al dashboard → ver el **banner** y el **SLRD marcado**; el botón del banner navega a snapshots. Subir el umbral → desaparecen.

- [ ] **Step 3 (opcional): Actualizar `docs/plan-slrd.md`**

Anotar que la Fase 3 completó las sub-fases 3a (suscripciones) y 3c (ajustes + frescura); queda 3b (historial/gráfico). Commit:

```bash
git add docs/plan-slrd.md
git commit -m "docs: marca sub-fase 3c completada"
```

- [ ] **Step 4: Cierre de rama**

Usar la skill `superpowers:finishing-a-development-branch` para verificar tests, presentar opciones y (si se elige) mergear `feat/fase3c-ajustes-frescura` a `main`.

---

## Notas de implementación

- **`user_settings` singleton:** una fila por usuaria (PK = `user_id default auth.uid()`), mismo patrón que `bice_config`. El upsert con `onConflict: 'user_id'` inserta la primera vez y actualiza después.
- **Umbral default 4:** el dashboard antes usaba una constante fija `FRESH_LIMIT_DAYS = 7`; 3c la reemplaza por el umbral de `user_settings` (default 4 según el spec). Cuando aún no hay fila, `mapSettingsRow(null)` devuelve 4, así que el dashboard funciona sin que la usuaria configure nada.
- **Borrar categoría:** la FK `on delete set null` (migración 0001) preserva transacciones y suscripciones; solo pierden el vínculo. La confirmación inline evita borrados accidentales sin usar `confirm()` nativo.
- **Copy del error de categoría:** el sheet asume que un error de guardado es choque de nombre único (`unique (user_id, name)`), que es el caso esperable, y muestra "Ya existe una categoría con ese nombre".
- **`BiceConfigSheet` compartido:** se mueve a `src/components/` sin cambiar su lógica ni el hook; Ciclo y Ajustes lo reusan.
