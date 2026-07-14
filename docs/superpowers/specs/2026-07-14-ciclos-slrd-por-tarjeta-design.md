# Ciclos y SLRD por tarjeta — Diseño (Sub-proyecto C de "tarjetas configurables")

Fecha: 2026-07-14
Estado: aprobado, listo para plan de implementación

## Contexto

Tercer y último sub-proyecto de "agregar una tarjeta de crédito configurable":

- **A — Gestión de cuentas** (spec + plan hechos).
- **B — Config de facturación por tarjeta** (spec + plan hechos): `card_billing_config` por
  cuenta + `usePrimaryCardConfig` transitorio; el cierre de ciclo sigue siendo de una sola tarjeta.
- **C — Ciclos y SLRD por tarjeta (este spec):** el motor de ciclos pasa a ser realmente
  por-tarjeta. Depende de A y B.

## Objetivo

Que cada tarjeta de crédito tenga su propio ciclo de facturación: su total sin facturar, su
cierre (que factura solo sus gastos), y su pago. El SLRD sigue siendo el número agregado
protagonista. `CicloScreen` muestra una sección apilada por tarjeta.

## Estado actual (single-card)

- Tabla `bice_billing_cycles` (`id, cycle_start, cycle_end, due_date, billed_amount, is_paid`) —
  **sin** `account_id`.
- RPC `close_cycle(p_billed_amount, p_cycle_start, p_cycle_end, p_due_date)` — crea un ciclo y
  estampa `billing_cycle_id` en **todos** los gastos de crédito abiertos (`billing_cycle_id IS
  NULL`). Devuelve `{ cycle_id, billed_amount, suma_ledger, diferencia }`.
- RPC `pay_cycle(p_cycle_id, p_santander_account_id, p_nuevo_saldo)` — marca el ciclo pagado.
- Vista `v_slrd` — calcula `deuda_facturada` (ciclos cerrados impagos) y `deuda_no_facturada`
  (gastos de crédito con `billing_cycle_id IS NULL`), entre otros. Espejo cliente: `slrdDelta`.
- `useCurrentCycleTransactions` — suma **todos** los gastos crédito abiertos como un solo ciclo.
- `useUnpaidCycles`/`usePaidCycles`, `useCloseCycle`, `usePayCycle`.
- `CicloScreen` — una sola vista de "ciclo actual".

## Decisiones de alcance (cerradas en brainstorming)

1. **UX:** una **sección apilada por cada tarjeta de crédito** en `CicloScreen` (todas visibles,
   scrolleando). No tabs.
2. **El SLRD sigue siendo agregado.** `deuda_no_facturada` y `deuda_facturada` suman across
   tarjetas sin cambio de lógica; solo cambian por el rename de tabla. `slrdDelta` no cambia.
3. **Cierre por tarjeta:** `close_cycle` estampa solo los gastos de la tarjeta cerrada. Usa la
   config de esa tarjeta (de B) para derivar fechas.
4. **Backfill:** los ciclos existentes se asignan a la tarjeta BICE principal.
5. **Se elimina el transitorio `usePrimaryCardConfig`** (introducido en B); ahora todo es
   por-tarjeta.

## Fuera de alcance (YAGNI)

- Desglose de deuda por-tarjeta en Dashboard/SLRD (el SLRD agregado sigue siendo el protagonista).
- Elegir "tarjeta principal" manualmente / reordenar.
- Ciclos para cuentas que no sean de crédito.

## Arquitectura

### Server-side (migración + RPCs + vista; corre el controller con gate humano + MCP)

1. **Tabla `billing_cycles`:** renombrar `bice_billing_cycles` → `billing_cycles`; agregar
   `account_id uuid references accounts(id)`; backfill de las filas existentes con el id de la
   tarjeta BICE principal (única cuenta `type='credit'`); luego `alter column account_id set not
   null`. Mantener RLS `user_id = auth.uid()`.
2. **RPC `close_cycle`:** agregar parámetro `p_account_id uuid`. Estampar `billing_cycle_id` solo
   donde `account_id = p_account_id AND billing_cycle_id IS NULL AND type='gasto'`. Guardar
   `account_id = p_account_id` en el ciclo nuevo. `suma_ledger` = suma de esos gastos (los de esa
   tarjeta), no de todos.
3. **RPC `pay_cycle`:** actualizar la referencia de tabla al nuevo nombre `billing_cycles`. Sin
   cambio de firma ni de lógica.
4. **Vista `v_slrd`:** actualizar la referencia `bice_billing_cycles` → `billing_cycles`. La lógica
   de agregación no cambia (sigue sumando across tarjetas).
5. Tras cada migración, regenerar `src/types/db.ts`.

### Capa de datos (cliente)

- `useCurrentCycleTransactions` → **por tarjeta.** Nueva forma: `useOpenCycle(accountId)` que
  filtra los gastos crédito abiertos por `account_id` y devuelve `{ items, total }`. `CicloScreen`
  la usa una vez por tarjeta de crédito.
- `useUnpaidCycles`/`usePaidCycles` → incluir `accountId` (y el nombre de la tarjeta, resuelto en
  el componente vía `useAccounts`, o traído en el select). El tipo `BillingCycle` gana `accountId`.
- `useCloseCycle` → agregar `accountId` al payload y pasarlo como `p_account_id` al RPC.
- `usePayCycle` → sin cambio de firma.
- Eliminar `usePrimaryCardConfig` (de B) y su uso; `CicloScreen` deriva la config de cada tarjeta
  con `useCardBillingConfigs()` (de B).

### Capa UI (`CicloScreen`)

- Por cada cuenta `type='credit'` (de `useAccounts`), una sección con:
  - Nombre de la tarjeta.
  - Total sin facturar + lista de sus gastos abiertos (`useOpenCycle(card.id)`).
  - Botón "Cerrar ciclo" que usa la config de esa tarjeta (de `useCardBillingConfigs`) para derivar
    fechas y llama `close_cycle` con su `accountId`. Si la tarjeta no tiene config → "Sin
    configurar" y no permite cerrar (link a Ajustes o al editor).
  - El diff post-cierre (boleta vs registrado) por tarjeta.
- `UnpaidCyclesSection`: cada ciclo impago muestra su tarjeta y permite pagar.
- Se elimina el flujo transitorio de "tarjeta principal".

## Manejo de errores y estados

- Igual que hoy por sección: loading (`Skeleton`), error con reintento, cierre/pago con estados de
  mutación.
- Tarjeta de crédito sin config → sección visible pero sin poder cerrar (mensaje "sin configurar").
- Sin tarjetas de crédito → mensaje vacío.

## Plan de pruebas

- `slrdDelta`, `cycleDates`, `deriveCycleDates`: **sin cambios**, tests verdes.
- **Server-side (migración):** check SQL en la migración — tras backfill, `select count(*) from
  billing_cycles where account_id is null` = 0; cerrar un ciclo de prueba estampa solo los gastos
  de esa tarjeta (verificación runtime).
- `useCloseCycle` (nuevo/actualizado): manda `p_account_id` con el `accountId` del payload.
- Mapeo de `useUnpaidCycles`: incluye `accountId`.
- `CicloScreen` (nuevo/actualizado): con 2 tarjetas de crédito renderiza 2 secciones separadas con
  sus totales; una tarjeta sin config muestra "sin configurar" sin botón de cierre habilitado.

## Estándares

clean-code-standards (SRP datos/UI, funciones puras donde aplique, nombres reveladores,
inmutabilidad). Migraciones con gate humano. Commits Conventional, español, trailer `Co-Authored-By`.
