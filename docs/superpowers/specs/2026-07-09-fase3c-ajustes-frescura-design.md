# Spec de diseño — Sub-fase 3c (Ajustes completo + frescura)

**Proyecto:** MiBanko — Saldo Líquido Real Disponible (SLRD)
**Fecha:** 2026-07-09 · **Estado:** aprobado en brainstorming, pendiente revisión de spec

Cierra la **Fase 3 ("Confort")** del [plan general](../../plan-slrd.md): completa la pantalla
**Ajustes** con CRUD de categorías y edición de fechas BICE, y potencia los **avisos de frescura**
del dashboard. Construye sobre 3a (Ajustes + suscripciones, ya en `main`). La pieza 3b
(historial/gráfico) queda para su propia sub-fase.

## 1. Objetivo verificable

Desde **Ajustes**, Josefa puede: crear, renombrar y borrar categorías; editar el día de corte y
vencimiento de la BICE; y ajustar el umbral de frescura. En el **dashboard**, cuando el último
snapshot supera ese umbral, aparece un **banner accionable** (botón → cargar saldos) y el número
del **SLRD se marca como posiblemente desactualizado**.

## 2. Decisiones de producto (del brainstorming)

| Tema | Decisión |
|---|---|
| Categorías | CRUD completo desde Ajustes: crear, renombrar, borrar. **Name-only** (sin color/ícono, YAGNI). |
| Borrar categoría | Seguro por `on delete set null` (las filas que la usaban quedan sin categoría). **Confirmación inline** (sin `confirm()` nativo). |
| Fechas BICE | Exponer en Ajustes el editor que ya existe. Se **mueve `BiceConfigSheet` a un lugar compartido**; Ciclo y Ajustes lo reusan. El acceso desde Ciclo se mantiene. |
| Frescura | Las tres: banner accionable, marcar el SLRD, y umbral configurable. |
| Umbral de frescura | Persistido en **DB** (tabla `user_settings`), sincronizado entre dispositivos, con lugar para futuras preferencias. Default 4 días. |

## 3. Invariantes que la sub-fase debe respetar

- Ningún componente llama `supabase-js` directo — siempre vía hooks en `src/data/`.
- Borrar una categoría **no** borra ni altera transacciones/suscripciones: solo desvincula
  (`category_id` pasa a null por la FK `on delete set null`).
- El cálculo del SLRD **no cambia**. La frescura es solo señalización visual sobre el mismo número.
- El umbral de frescura solo afecta la UI (cuándo mostrar el banner y marcar el SLRD); no toca datos.

## 4. Schema (migración `0006_user_settings.sql`)

Las tablas `categories` y `bice_config` **ya existen** (migraciones 0001/0004) y no se modifican.
`categories (id, user_id default auth.uid(), name, unique(user_id, name))` ya trae el `unique` que
usamos para detectar nombres duplicados. Solo se crea la tabla de preferencias:

```sql
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

Singleton por usuaria, mismo patrón que `bice_config`. Se aplica el **mismo** SQL al remoto
`feljshqybemysbokqedp` vía `apply_migration` con nombre `0006_user_settings`.

## 5. Capa de datos (hooks)

**Categorías** (`src/data/useCategories.ts`, ya existe con `useCategories`):
- `useSaveCategory()` — upsert `{ id?, name }`; inserta o renombra. Propaga el error de nombre
  duplicado (violación `unique (user_id, name)`) para mostrarlo inline. Invalida `['categories']`.
- `useDeleteCategory()` — borra por id (FK `set null` preserva las filas). Invalida `['categories']`.

**Preferencias de usuaria** (`src/data/useUserSettings.ts`, nuevo):
- `mapSettingsRow(row) => UserSettings` — snake→camel (`fresh_limit_days` → `freshLimitDays`).
- `useUserSettings()` — lee la fila; **si no hay fila, default `{ freshLimitDays: 4 }`**
  (`maybeSingle`). Clave `['user-settings']`.
- `useSaveUserSettings()` — upsert `{ fresh_limit_days }` con `onConflict: 'user_id'` +
  `updated_at`; invalida `['user-settings']`. (Mismo patrón que `useSaveBiceConfig`.)

**Lógica pura** (`src/data/freshness.ts`, nuevo):
- `isStale(ageDays: number | null, limitDays: number): boolean` — `ageDays != null && ageDays > limitDays`.

Tipos nuevos en `src/data/types.ts`: `UserSettings { freshLimitDays: number }`.

## 6. UI — Pantalla Ajustes

La `AjustesScreen` (de 3a, hoy solo `SubscriptionsSection`) suma tres secciones, en este orden:
Suscripciones (existente) · **Categorías** · **Ciclo BICE** · **Frescura**.

### 6.1 `CategoriesSection` (`src/features/ajustes/CategoriesSection.tsx`)
- Lista las categorías (nombre) con botón "+ Agregar".
- **Agregar/renombrar:** `CategorySheet` (`BottomSheet` con un único input de nombre; botón
  Guardar deshabilitado si vacío). Al guardar hace upsert; si el nombre choca con el `unique`,
  muestra inline "Ya existe una categoría con ese nombre" y no cierra el sheet.
- **Borrar:** ícono de tacho con **confirmación inline** — primer tap muestra "¿Borrar? Sí / No"
  en la fila; "Sí" llama `useDeleteCategory`. `aria-label={`Borrar ${c.name}`}`.
- Estados obligatorios: loading (skeleton), empty ("No tenés categorías. Agregá la primera."),
  error (inline + retry) tanto al listar como al guardar/borrar.

### 6.2 `BiceConfigSection` (`src/features/ajustes/BiceConfigSection.tsx`)
- Muestra "Corte día N · Vence día M" leídos de `useBiceConfig` (o "Sin configurar" si null).
- Botón editar abre el `BiceConfigSheet` **movido** de `src/features/ciclo/BiceConfigSheet.tsx`
  a `src/components/BiceConfigSheet.tsx`; `CicloScreen` actualiza su import al nuevo path. Sin
  duplicar lógica ni el hook.

### 6.3 `FreshnessSection` (`src/features/ajustes/FreshnessSection.tsx`)
- Input numérico "Avisarme si el snapshot tiene más de N días" (clamp 1–60), inicializado con
  `useUserSettings().data.freshLimitDays`. Guardar llama `useSaveUserSettings`. Estados de
  guardado (pending/error inline).

## 7. UI — Dashboard (frescura avanzada)

`DashboardScreen` reemplaza la constante fija `FRESH_LIMIT_DAYS` por el umbral de
`useUserSettings()` y usa `isStale(age, limit)`:

- **Header:** mantiene el badge "hace N días" (atenuado si fresco, en color de aviso si stale).
- **Banner accionable:** cuando `isStale`, un banner visible ("Tu SLRD puede estar
  desactualizado — actualizá tus saldos") con botón que navega a `/snapshots`.
- **SLRD marcado:** cuando `isStale`, el número grande del SLRD se atenúa/marca (p. ej. opacidad
  reducida + subtítulo "estimado, snapshot viejo"). Cuando está fresco, se ve normal.

El SLRD sigue calculándose igual; solo cambia su presentación cuando está viejo.

## 8. Estados obligatorios

- **Loading:** skeleton con la forma de cada sección.
- **Empty:** categorías sin filas → texto tranquilo con CTA; BICE sin configurar → "Sin configurar".
- **Error:** inline + retry al listar categorías y al guardar/borrar (categorías, settings, BICE).

## 9. Testing

- **Lógica pura (`.test.ts`):**
  - `isStale`: null → false; age ≤ limit → false; age > limit → true.
  - `mapSettingsRow`: snake→camel; sin fila → default 4 (probado en el hook o helper).
- **Hooks:** `useSaveCategory` propaga el error de duplicado; invalidaciones de queryKey.
- **Componentes (`.test.tsx`, supabase mockeado):**
  - `CategoriesSection`: lista categorías; agregar llama `mutate` con el nombre; borrar pide
    confirmación y recién entonces llama delete; empty state; error de duplicado visible.
  - `FreshnessSection`: guarda el umbral con `mutate`.
  - `DashboardScreen`: con `age > umbral` renderiza el banner y marca el SLRD; con `age ≤ umbral`
    no. (Mockear `useUserSettings` y `useLatestSnapshotAge`.)
- `userEvent`: `const user = userEvent.setup()`.

## 10. Verificación end-to-end (resultado de la sub-fase)

En el navegador, contra Supabase real: en Ajustes crear/renombrar/borrar una categoría (verificar
que una transacción vieja con esa categoría queda sin categoría, no se borra); editar fechas BICE
desde Ajustes y ver el cambio reflejado en Ciclo; bajar el umbral de frescura por debajo de la edad
del último snapshot y ver el banner + el SLRD marcado en el dashboard; subir el umbral y ver que
desaparecen.

## 11. Fuera de alcance de la sub-fase 3c

- Color/ícono por categoría; auto-categorización (keyword → categoría); presupuestos por categoría.
- Historial/analítica con gráfico + `slrd_history` (sub-fase 3b).
- PWA / deploy (Fase 4).
