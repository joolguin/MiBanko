# Presupuestos por categoría con alertas — Diseño (Backlog v2 #6)

Fecha: 2026-07-11
Estado: aprobado, listo para plan de implementación

## Objetivo

Permitir a la usuaria fijar un presupuesto mensual (monto en CLP) por categoría de
gasto y ver, dentro de Historial, cuánto ha gastado contra ese presupuesto con estados
visuales (verde/ámbar/rojo). Al registrar un gasto que la deja sobre un umbral, un aviso
no bloqueante se lo indica.

No es un feature que afecte el SLRD: los presupuestos son analítica de gasto, viven
junto a la analítica de gasto por categoría existente.

## Decisiones de alcance (cerradas en brainstorming)

1. **Período:** mes calendario. El modelo queda abierto a otros períodos (ciclo BICE)
   sin cerrarse, pero solo se implementa mensual (YAGNI).
2. **Qué gasto cuenta:** todo `type === 'gasto'` de la categoría (crédito BICE + débito
   Santander), reusando la misma regla que `computeCategorySpend`.
3. **Alertas:** solo visual / in-app en esta iteración. Push notifications = fase 2
   futura (documentada, fuera de alcance).
4. **Umbrales:** fijos. `ok` < 80%, `warn` 80–99%, `over` ≥ 100%. Aviso no bloqueante al
   registrar un gasto que deja la categoría sobre umbral.
5. **Alcance del modelo:** solo presupuestos por categoría. Tope global mensual = futuro,
   fuera de alcance.
6. **Ubicación:** nueva sub-pestaña "Presupuestos" en Historial, junto a la analítica de
   gasto por categoría. Gestión (crear/editar/borrar) co-localizada con la visualización.

## Modelo de datos

Migración Supabase (toca PRODUCCIÓN — confirmar antes de aplicar). Tras aplicarla,
regenerar `src/types/db.ts` (o el build se rompe en silencio: `tsc --noEmit` no lo
detecta).

Tabla nueva `budgets`:

| Columna       | Tipo  | Notas |
| ------------- | ----- | ----- |
| `id`          | uuid  | pk, default `gen_random_uuid()` |
| `category_id` | uuid  | FK → `categories(id)` **ON DELETE CASCADE**, **UNIQUE** |
| `amount`      | int   | CLP, CHECK `amount > 0` |
| `created_at`  | timestamptz | default `now()` |
| `updated_at`  | timestamptz | default `now()` |

- Un presupuesto por categoría (UNIQUE en `category_id`).
- Si se borra la categoría, su presupuesto se borra en cascada.
- RLS habilitada, policies iguales al resto de tablas de la app (usuaria única).

**Puerta abierta a más períodos:** la tabla NO guarda período; la interpretación
"mensual" vive en la capa de cálculo. Generalizar a ciclos BICE luego = agregar columnas
de período y soltar el UNIQUE, sin reescribir lo actual. Se evita a propósito una columna
`period` que hoy nadie leería.

## Capa de datos (React Query)

- `useBudgets()` — query `['budgets']`, `select id, category_id, amount`, calcado de
  `useCategories()` (staleTime 5 min).
- `useSaveBudget()` — upsert `{ category_id, amount }`, `onSuccess` invalida `['budgets']`.
- `useDeleteBudget()` — delete por `id` (o por `category_id`), invalida `['budgets']`.

Cambio mínimo en `useMonthTransactions`: agregar `category_id` al select y `categoryId`
al tipo `MonthTx`. Necesario para matchear presupuesto↔gasto por id (robusto ante
renombres de categoría). No toca SLRD ni sus invalidaciones.

Tipos nuevos en `src/data/types.ts`:

```ts
export interface Budget {
  id: string
  categoryId: string
  amount: number
}

export type BudgetState = 'ok' | 'warn' | 'over'

export interface BudgetStatus {
  categoryId: string
  categoryName: string
  amount: number
  spent: number
  pct: number          // spent / amount, 0..(>1)
  state: BudgetState
}
```

`MonthTx` gana `categoryId: string | null`.

## Cálculo (función pura)

`src/data/budgetStatus.ts`:

```ts
export const WARN_THRESHOLD = 0.8   // 80%
export const OVER_THRESHOLD = 1.0   // 100%

export function computeBudgetStatus(
  txs: MonthTx[],
  budgets: Budget[],
  categories: Category[],
): BudgetStatus[]
```

- `spent` = suma de `amount` de txs con `type === 'gasto'` y `categoryId === budget.categoryId`
  (misma regla de gasto que `computeCategorySpend`; crédito + débito).
- `pct = amount > 0 ? spent / amount : 0`.
- `state`: `over` si `pct >= OVER_THRESHOLD`, `warn` si `pct >= WARN_THRESHOLD`, si no `ok`.
- Ordena por `pct` descendente (lo más apretado primero).
- Gasto "Sin categoría" (`categoryId === null`) nunca cuenta contra ningún presupuesto.

Helper para el "+ agregar": categorías sin presupuesto = `categories` que no aparecen en
`budgets`. Puede ser una función aparte (`categoriesWithoutBudget`) o derivarse en el
componente; se decide en el plan.

## UI — sub-pestaña "Presupuestos" en Historial

`HistorialScreen` hoy tiene `SubTab = 'slrd' | 'gasto' | 'movimientos'`. Se agrega
`'presupuestos'`.

`BudgetsTab` (nuevo, espejo estructural de `CategorySpendTab`):
- Reusa `MonthNav` (mismo mes que el resto de Historial) y `useMonthTransactions(month)`.
- Carga `useBudgets()` + `useCategories()`.
- Estados: loading (Skeleton), error (mensaje + Reintentar), vacío (sin presupuestos →
  invita a agregar el primero), poblado.
- Poblado: por cada `BudgetStatus`, una fila con:
  - nombre de categoría,
  - barra de progreso (ancho = min(pct, 1)·100%), color según `state`
    (verde `ok` / ámbar `warn` / rojo `over`),
  - texto `$gastado / $presupuesto (pct%)` con `MoneyText`.
- Tap en una fila → sheet chico para editar/borrar el monto.
- "+ Agregar presupuesto" → lista de categorías sin presupuesto; elegir una abre el sheet
  para fijar el monto.

`BudgetSheet` (nuevo): input de monto (CLP), guardar (`useSaveBudget`), borrar
(`useDeleteBudget`) si ya existía. Sigue el patrón de `SubscriptionSheet`.

## Aviso al registrar

En `RegistroScreen`, al guardar un `gasto` cuya categoría tiene presupuesto: mensaje
inline no bloqueante, p. ej. *"Con esto quedas en $X de $Y en Supermercado (105%)"*, o un
aviso más suave al cruzar 80%. El registro se completa igual; el aviso es informativo.

Requiere que Registro disponga de `useBudgets()` + el gasto del mes en curso de esa
categoría (via `useMonthTransactions` del mes actual, ya disponible en la app). El cálculo
del pct post-registro reusa la misma lógica de umbrales (`WARN_THRESHOLD`/`OVER_THRESHOLD`).

## Fuera de alcance (futuro)

- **Push notifications** (permiso de notificaciones, service worker con push, cron/edge
  function que evalúe presupuestos server-side).
- **Tope global mensual** (presupuesto no atado a `category_id`).
- **Períodos distintos al mes calendario** (ciclo BICE).

## Testing (TDD)

- `computeBudgetStatus` (unitario, prioridad): bordes de estado (79%/80%/99%/100%/101%),
  categoría sin presupuesto (no aparece), `amount` inválido/no presente, gasto "Sin
  categoría" excluido, match por `categoryId` correcto, orden por pct desc.
- `BudgetsTab` (componente): loading / error / vacío / poblado, espejo de
  `CategorySpendTab.test.tsx`.
- Hooks `useBudgets`/`useSaveBudget`/`useDeleteBudget`: patrón de tests de datos
  existente.
- Aviso al registrar: aparece cuando el gasto deja la categoría sobre umbral; ausente
  cuando la categoría no tiene presupuesto.

## Notas de integración / gotchas

- Regenerar `src/types/db.ts` tras la migración.
- Todo hook de mutación sobre `transactions` debe seguir invalidando `['slrd']`,
  `['month-transactions']`, `['slrd-history']` y `['current-cycle']`. Este feature no
  agrega mutaciones de `transactions`, pero el aviso al registrar se monta sobre el flujo
  de registro existente, que ya cumple esa regla — no romperla.
- `budgets` es tabla independiente; sus mutaciones solo invalidan `['budgets']`.
