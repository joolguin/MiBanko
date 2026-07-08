# Spec de diseño — Fase 2 (Ciclos)

**Proyecto:** MiBanko — Saldo Líquido Real Disponible (SLRD)
**Fecha:** 2026-07-07 · **Estado:** aprobado en brainstorming, pendiente revisión de spec

Cubre la **Fase 2 (Ciclos)** del [plan general](../../plan-slrd.md): pantalla de snapshots y
gestión del ciclo de facturación BICE (cerrar, pagar). Construye sobre la Fase 1 (ya en `main`).

## 1. Objetivo verificable

Simular el **ciclo completo de punta a punta**: gastar (Fase 1) → **cerrar ciclo** (la deuda pasa
de "no facturada" a "facturada", el SLRD no cambia) → **pagar** (baja el snapshot de Santander, la
deuda facturada desaparece, el SLRD sigue igual porque esa plata ya la debías).

## 2. Decisiones de producto (del brainstorming)

| Tema | Decisión |
|---|---|
| Fechas del ciclo | Config una vez (`closing_day` + `due_day`); la app deriva `cycle_start`/`cycle_end`/`due_date` al cerrar. Solo se ingresa `billed_amount`. |
| Marcar pagada | Un solo paso: `is_paid=true` **+** nuevo snapshot de Santander (último − `billed_amount`, editable) en la misma acción, para que el SLRD quede honesto automáticamente. |
| Diferencia al cerrar | Solo informativa. `billed_amount` es la fuente de verdad; las transacciones quedan como detalle. Sin ajustes automáticos ni bloqueo. |
| Atomicidad | Cerrar y pagar son funciones **RPC en Postgres** (transaccionales), no orquestación en cliente. |

## 3. Invariantes del SLRD que la fase debe respetar

Recordatorio de las fórmulas (Fase 0):
```
slrd_inmediato = snapshot(Santander) − deuda_facturada − deuda_no_facturada
deuda_facturada    = Σ billed_amount de ciclos con is_paid=false
deuda_no_facturada = Σ gastos BICE con billing_cycle_id IS NULL
```
- **Cerrar** un ciclo mueve `billed_amount` de `deuda_no_facturada` a `deuda_facturada`.
  Si `billed_amount` = suma de los gastos asignados, el SLRD **no cambia**. Si difiere, el SLRD
  se ajusta por la diferencia (la boleta manda) — esto es correcto y esperado.
- **Pagar** baja `snapshot(Santander)` en `billed_amount` y saca ese monto de `deuda_facturada`;
  ambos efectos se cancelan → el `slrd_inmediato` **no cambia** al pagar.

## 4. Schema (migración `0004_bice_config_y_rpc.sql`)

### 4.1 Tabla `bice_config` (una fila por usuaria)
```
bice_config
  user_id      uuid primary key references auth.users(id) on delete cascade
  closing_day  int not null check (closing_day between 1 and 28)
  due_day      int not null check (due_day between 1 and 28)
  updated_at   timestamptz not null default now()
```
RLS: `user_id = auth.uid()` (all). Insert/update vía upsert.

### 4.2 `close_cycle(p_billed_amount numeric, p_closing_date date) returns json` — `security invoker`
En una transacción:
1. Requiere `bice_config` de la usuaria; si no existe, `raise exception 'bice_config_missing'`.
2. Deriva fechas: `cycle_end` = el `closing_day` del mes de `p_closing_date` (ajustado si el día ya
   pasó); `cycle_start` = día siguiente al `cycle_end` del mes anterior; `due_date` = próximo
   `due_day` a partir de `cycle_end`.
3. Inserta `bice_billing_cycles` (`user_id=auth.uid()`, `billed_amount=p_billed_amount`, `is_paid=false`, fechas derivadas).
4. `UPDATE transactions SET billing_cycle_id = <nuevo> WHERE user_id=auth.uid() AND account.type='credit' AND type='gasto' AND billing_cycle_id IS NULL` (asigna los gastos sueltos).
5. Devuelve `{ cycle_id, billed_amount, suma_ledger, diferencia }` (`diferencia = billed_amount − suma_ledger`).

### 4.3 `pay_cycle(p_cycle_id uuid, p_santander_account_id uuid, p_nuevo_saldo numeric) returns void` — `security invoker`
En una transacción:
1. `UPDATE bice_billing_cycles SET is_paid=true WHERE id=p_cycle_id AND user_id=auth.uid()` (falla si no pertenece).
2. `INSERT balance_snapshots` (`account_id=p_santander_account_id`, `balance=p_nuevo_saldo`, `snapshot_date=now()`).
   El `account_id` de Santander lo pasa el frontend (lo conoce vía `useAccounts`); la RLS de
   `balance_snapshots` valida que la cuenta pertenezca a la usuaria. Asume una única cuenta débito en v1.

Ambas funciones se apoyan en RLS/`auth.uid()`; nunca reciben `user_id` del cliente.

## 5. Pantallas

### 5.1 Snapshots
- Dos campos (Santander, Fintual) con `NumberPad`, cada uno mostrando el último valor y "hace N días".
- Guardar inserta un snapshot **solo** por cada campo modificado.
- Al volver, dashboard y aviso de frescura se actualizan.

### 5.2 Ciclo BICE
- **Ciclo actual (sin facturar):** lista de gastos BICE con `billing_cycle_id IS NULL` + suma parcial.
- **Cerrar ciclo:** `BottomSheet` con `billed_amount` (numpad) + fecha de cierre (default hoy) → `close_cycle`.
  Muestra la alerta de diferencia si `diferencia ≠ 0` (informativa).
- **Ciclos facturados pendientes (`is_paid=false`):** cada uno con `billed_amount` y vencimiento;
  **Marcar pagada** → `BottomSheet` con el nuevo saldo Santander propuesto (último − `billed_amount`, editable) → `pay_cycle`.
- **Historial de ciclos pagados:** lista corta, colapsada.

### 5.3 Mini-config BICE
- Botón "Fechas BICE" dentro de Ciclo → `BottomSheet` para setear `closing_day` + `due_day`.
- Si no hay `bice_config`, "Cerrar ciclo" redirige a configurarla primero (mensaje claro, no error crudo).

## 6. Capa de datos (hooks)

- `useBiceConfig()` / `useSaveBiceConfig()` — lee/upserta `bice_config`.
- `useCurrentCycleTransactions()` — gastos BICE sin facturar + suma.
- `useUnpaidCycles()` — ciclos `is_paid=false`.
- `useSaveSnapshot()` — inserta snapshots (solo los modificados).
- `useCloseCycle()` — RPC `close_cycle`; devuelve `{ cycle, diferencia }`; `onSettled` invalida
  `['slrd']`, `['current-cycle']`, `['unpaid-cycles']`, `['snapshot-age']`.
- `usePayCycle()` — RPC `pay_cycle`; invalida los mismos keys.

Sin update optimista en cerrar/pagar: el valor exacto lo devuelve el server; se muestra estado
"procesando" y se refresca al volver. Los componentes nunca llaman a `supabase-js` directo.

## 7. Estados obligatorios
- **Loading:** skeletons con la forma real.
- **Empty:** ciclo sin gastos → "nada por facturar aún"; sin ciclos pendientes → estado vacío tranquilo. Nunca números falsos.
- **Error:** inline + retry en cada acción (cerrar, pagar, guardar snapshot).

## 8. Testing
- **RPC (SQL, vía MCP de Supabase sobre datos de prueba):**
  - `close_cycle` asigna las transacciones sueltas al ciclo y calcula bien `diferencia`.
  - `close_cycle` falla sin `bice_config`.
  - `pay_cycle` marca `is_paid=true` y crea el snapshot; falla si el ciclo no pertenece.
  - El SLRD (`v_slrd`) queda correcto después de cerrar (sin cambio si billed=suma) y de pagar (sin cambio).
- **Lógica pura cliente:** derivación de fechas desde `closing_day`/`due_day` (AAA); cálculo de la diferencia mostrada.
- **Hooks/pantallas (supabase-js mockeado):** `useCloseCycle`/`usePayCycle` invalidan los keys correctos;
  la pantalla de Ciclo muestra suma parcial, alerta de diferencia y deshabilita "Cerrar" sin config.
- Vitest + Testing Library.

## 9. Verificación end-to-end (resultado de la fase)
En el navegador, contra Supabase real: gastar → cerrar (deuda pasa a facturada, SLRD igual) →
pagar (snapshot baja, deuda facturada desaparece, SLRD igual).

## 10. Fuera de alcance de Fase 2
- Suscripciones fijas + cron (Fase 3).
- Historial/analítica con gráficos, avisos de frescura avanzados (Fase 3).
- Pantalla de Configuración completa (Fase 3); en Fase 2 solo la mini-config de fechas BICE.
- PWA / deploy (Fase 4).

## 11. Navegación
- Se activa el tab **Ciclo** en la barra inferior (hoy atenuado). Snapshots se accede desde Ciclo
  (o desde un acceso en el dashboard). El tab Historial/Ajustes sigue atenuado hasta Fase 3.
