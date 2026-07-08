# Spec de diseño — Sub-fase 3a (Suscripciones fijas + cron)

**Proyecto:** MiBanko — Saldo Líquido Real Disponible (SLRD)
**Fecha:** 2026-07-08 · **Estado:** aprobado en brainstorming, pendiente revisión de spec

Cubre la primera pieza de la **Fase 3 ("Confort")** del [plan general](../../plan-slrd.md):
**suscripciones fijas auto-registradas por cron**. Construye sobre la Fase 2 (ya en `main`).
Las otras dos piezas de Fase 3 quedan para sub-fases posteriores: historial/gráfico + `slrd_history`
(3b) y CRUD completo de Ajustes + avisos de frescura (3c).

## 1. Objetivo verificable

Una suscripción activa con `charge_day_of_month = hoy` genera **automáticamente** un gasto BICE
(`source='auto'`), de forma **idempotente**, y ese gasto aparece en "ciclo actual sin facturar" y
baja el SLRD — sin que Josefa toque nada. Si el cron no corre un día (proyecto pausado en el free
tier), la app recupera el cobro al abrirse.

## 2. Decisiones de producto (del brainstorming)

| Tema | Decisión |
|---|---|
| Gestión de suscripciones | Se activa el tab **Ajustes** (hoy atenuado) con una **sección Suscripciones**. Categorías y fechas BICE en Ajustes quedan para 3c. |
| Día de cobro | `charge_day_of_month` entre 1 y 28 (el check ya existe en `fixed_subscriptions`), consistente con `bice_config`. Sin lógica de fin de mes. |
| Robustez del cobro | Lógica en una **RPC idempotente** `run_due_subscriptions()`, llamada por `pg_cron` (diario) **y** por la app al abrir. Idempotencia garantizada por índice único. |
| Borrar vs. pausar | Ambos: pausar (`is_active=false`) y borrar. Borrar usa `on delete set null` en el vínculo, preservando los gastos pasados. |
| Categoría | Opcional al crear una suscripción (como en transacciones). |

## 3. Invariantes del SLRD que la sub-fase debe respetar

El gasto auto es un gasto BICE normal con `billing_cycle_id IS NULL`, así que entra en
`deuda_no_facturada` y baja el `slrd_inmediato` como cualquier gasto del ciclo actual. Al cerrar el
ciclo, `close_cycle` se lo asigna igual que a los gastos manuales (es `credit` + `gasto` +
`billing_cycle_id IS NULL` dentro del rango de fechas). No se introduce ninguna ruta nueva de deuda.

## 4. Schema (migración `0005_suscripciones_cron.sql`)

La tabla `fixed_subscriptions` y su RLS **ya existen desde Fase 0** (migraciones 0001/0002):
`id, user_id, name, amount, charge_day_of_month (check 1..28), category_id, channel, is_active,
created_at`. No se modifican.

### 4.1 Vínculo transacción → suscripción
```sql
alter table public.transactions
  add column if not exists subscription_id uuid
    references public.fixed_subscriptions(id) on delete set null;
```
Nullable: las transacciones manuales lo dejan en null; al borrar una suscripción, sus gastos
pasados quedan (`set null`) como `source='auto'` sin vínculo.

### 4.2 Índice único parcial de idempotencia
Un solo cobro por suscripción por mes calendario:
```sql
create unique index if not exists uq_tx_subscription_month
  on public.transactions (subscription_id, (date_trunc('month', transaction_date::timestamp)))
  where subscription_id is not null;
```
`date_trunc('month', <date>::timestamp)` es IMMUTABLE, por lo que sirve en un índice de expresión.

### 4.3 RPC `run_due_subscriptions() returns int` — `security definer`
Una sola función para los dos llamadores (sin duplicar lógica). `security definer` para poder
escribir en `transactions` cuando corre desde `pg_cron` (sin sesión de usuaria); siempre restringe
los inserts al `user_id` de la propia suscripción.

Lógica:
1. Determina el conjunto de usuarias objetivo:
   - Si `auth.uid()` **no** es null (llamada desde la app autenticada) → solo esa usuaria.
   - Si `auth.uid()` es null (llamada desde `pg_cron` como `postgres`) → **todas** las usuarias con
     suscripciones activas.
2. `v_hoy := (now() at time zone 'America/Santiago')::date`;
   `v_dia := extract(day from v_hoy)::int`.
3. Para cada suscripción con `is_active = true` y `charge_day_of_month = v_dia` de las usuarias
   objetivo:
   - Resuelve la cuenta `credit` (BICE) de esa usuaria (`select id from accounts where user_id=... and type='credit' limit 1`).
     Si no hay cuenta credit, **salta** esa suscripción sin fallar.
   - `insert into transactions (user_id, account_id, type, amount, transaction_date, channel,
     category_id, description, source, billing_cycle_id, subscription_id)
     values (<sub.user_id>, <bice_id>, 'gasto', sub.amount, v_hoy, sub.channel, sub.category_id,
     sub.name, 'auto', null, sub.id)
     on conflict (subscription_id, (date_trunc('month', transaction_date::timestamp))) do nothing;`
   - Cuenta las filas efectivamente insertadas.
4. Devuelve el total de cobros creados (0 si no había nada que cobrar o ya estaban cobrados).

`grant execute on function public.run_due_subscriptions() to authenticated;` (la app la llama con
la sesión de la usuaria). `pg_cron` la ejecuta como `postgres`, que ya tiene permiso.

### 4.4 Cron (`pg_cron`)
```sql
create extension if not exists pg_cron;
select cron.schedule('run-due-subscriptions', '0 9 * * *',
  $$select public.run_due_subscriptions()$$);
```
Diario a las 09:00 UTC — siempre ya es el nuevo día en Santiago (UTC−3/−4). Corre como `postgres`
→ `auth.uid()` null → procesa a todas las usuarias. La red de seguridad en la app cubre cualquier
día que el cron no haya corrido.

## 5. Red de seguridad en la app

`useRunDueSubscriptions()` llama la RPC **una vez al abrir la app** (montaje del área autenticada),
throttled a **1 vez por día** vía `localStorage` (clave con la fecha). Al terminar, invalida
`['slrd']` y `['current-cycle']`. Fire-and-forget: si la RPC falla, no rompe la UI (el cron sigue
siendo el mecanismo principal). Por ser idempotente, llamarla de más nunca duplica cobros.

## 6. Pantalla Ajustes + navegación

- Nueva ruta `/ajustes` en el router; se **activa el tab Ajustes** en `AppShell` (hoy `disabled`).
- La pantalla, por ahora, muestra **solo la sección Suscripciones** (categorías/fechas BICE son 3c).
- **Sección Suscripciones:**
  - Lista: por cada suscripción, nombre, monto, "día N", categoría (si tiene), y toggle
    activa/pausada. Las pausadas se ven atenuadas.
  - **Agregar / editar:** `BottomSheet` con nombre, monto (`NumberPad`), día de cobro (1–28),
    categoría (opcional) y canal. Guardar hace upsert.
  - **Pausar/reactivar:** toggle de `is_active`.
  - **Borrar:** elimina la suscripción (los gastos pasados se conservan por `on delete set null`).

## 7. Capa de datos (hooks)

- `useSubscriptions()` — lista las suscripciones de la usuaria (`['subscriptions']`).
- `useSaveSubscription()` — insert/update (upsert); invalida `['subscriptions']`.
- `useToggleSubscription()` — cambia `is_active`; invalida `['subscriptions']`.
- `useDeleteSubscription()` — borra; invalida `['subscriptions']`.
- `useRunDueSubscriptions()` — RPC `run_due_subscriptions`; invalida `['slrd']` y `['current-cycle']`.

Ningún componente llama `supabase-js` directo. Tipos nuevos: `Subscription` en `types.ts`;
`subscriptionId` en el mapeo de transacciones (para analítica futura, no se usa en 3a en UI).

## 8. Estados obligatorios

- **Loading:** skeleton con la forma de la lista.
- **Empty:** sin suscripciones → estado vacío tranquilo con CTA "Agregar suscripción".
- **Error:** inline + retry en cargar la lista y en guardar/borrar.

## 9. Testing

- **RPC (SQL, vía MCP de Supabase sobre datos de prueba):**
  - Crea el gasto `auto` cuando `charge_day_of_month` = día de hoy (Santiago).
  - **Idempotente:** una segunda llamada el mismo mes devuelve 0 cobros y no duplica.
  - Respeta `is_active = false` (no cobra pausadas).
  - Scoping: llamada con `request.jwt.claims.sub` = usuaria → solo esa; sin claims (simulando cron)
    → todas.
  - No cobra si `charge_day_of_month` ≠ día de hoy.
  - Salta suscripciones de usuarias sin cuenta `credit` sin fallar.
- **Hooks/pantallas (supabase-js mockeado):**
  - La lista renderiza suscripciones y estados loading/empty/error.
  - El sheet de agregar/editar llama `mutate` con los campos correctos.
  - El toggle y el borrar invalidan `['subscriptions']`.
  - `useRunDueSubscriptions` respeta el throttle de 1 vez/día (no vuelve a llamar el mismo día).
- Vitest + Testing Library.

## 10. Verificación end-to-end (resultado de la sub-fase)

En el navegador, contra Supabase real: crear una suscripción con `charge_day_of_month = hoy` →
llamar `run_due_subscriptions` (o abrir la app) → aparece el gasto en "ciclo actual sin facturar" y
el SLRD baja por el monto. Segunda llamada el mismo día → sin cambios (idempotente).

## 11. Fuera de alcance de la sub-fase 3a

- Historial/analítica con gráfico y tabla `slrd_history` + cron diario del SLRD (3b).
- CRUD de categorías y edición de fechas BICE dentro de Ajustes (3c).
- Avisos de frescura avanzados más allá del badge actual del dashboard (3c).
- PWA / deploy (Fase 4).
