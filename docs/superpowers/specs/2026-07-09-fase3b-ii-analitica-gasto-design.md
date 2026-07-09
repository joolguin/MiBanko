# Sub-fase 3b-ii — Analítica de gasto y movimientos (diseño)

**Fecha:** 2026-07-09 · **Rama:** `feat/fase3b-ii-analitica-gasto` · **Estado:** aprobado

## 1. Contexto y objetivo

Última pieza de la Fase 3. En 3b-i se agregó el historial + gráfico del SLRD dentro de una
pantalla "Historial". 3b-ii completa esa pantalla con la analítica de **gasto por categoría**
(dona por mes) y una **lista de transacciones con filtros**, decidida en brainstorming como
sub-fase propia (spec/plan separados de 3b-i).

La pantalla Historial pasa a tener sub-pestañas: **SLRD | Gasto | Movimientos**.

## 2. Decisiones de diseño (brainstorming)

| Decisión | Elección | Motivo |
|---|---|---|
| Alcance del "gasto por categoría" | **Todos los gastos** (`type='gasto'`, BICE crédito + Santander débito) | Foto real de consumo; el plan maestro define el débito como analítica de categorías |
| Período | **Mes calendario** (America/Santiago), default mes actual, con navegación ‹ mes › | Lectura natural de "en qué gasté este mes"; permite comparar meses |
| Forma del gráfico | **Dona / pie** (SVG a mano, sin librería) | Preferencia de la usuaria |
| Legibilidad de la dona | **Top N categorías + "Otros"** + leyenda-lista con monto y % | Mantiene la dona legible con muchas categorías |
| Estructura UI | **Sub-tabs** `SLRD \| Gasto \| Movimientos` dentro de Historial | Ordenado si cada sección crece |
| Filtros de Movimientos | **Mes + categoría + tipo + cuenta** | Set de filtros completo para explorar los movimientos |

### Detalles resueltos con default

- **Una sola fetch por mes:** un hook `useMonthTransactions(mes)` trae las transacciones del mes;
  la dona y la lista se derivan de esos mismos datos (DRY, filtrado en cliente). Sin migración.
- **Mes compartido:** los sub-tabs Gasto y Movimientos comparten un `selectedMonth`. El sub-tab
  SLRD conserva sus chips de rango (30d/90d/Todo) de 3b-i.
- **Gastos sin categoría:** entran a la dona como segmento **"Sin categoría"** (honestidad del dato).
- **Sub-tab default:** SLRD (la pieza primaria existente).

## 3. Constraints permanentes que aplican

- Ningún componente llama `supabase-js` directo: siempre vía hooks en `src/data/`.
- Timezone de cualquier cálculo por fecha: **America/Santiago**.
- Toda pantalla/sección: estados **loading (skeleton) / empty (texto tranquilo) / error (inline +
  retry)**.
- Gráficos: **SVG a mano, sin librería** (el bundle es el límite).
- Tests: lógica pura en `.test.ts`, componentes en `.test.tsx`, con `const user = userEvent.setup()`.
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni trailers de co-autoría de IA.
- Clean code: nombres descriptivos, funciones cortas (SRP), guard clauses, sin números mágicos.
- Moneda: CLP sin decimales; usar `MoneyText` / `formatCLP` / `formatSignedCLP` existentes.

## 4. Backend

**No hay migración.** 3b-ii son solo lecturas sobre tablas existentes:
`transactions` + join `categories(name)` + `accounts(name, type)`. Los índices existentes
(`idx_transactions_user`, `idx_transactions_account_date`) alcanzan para el volumen de una usuaria.
El join embebido de PostgREST ya se usa en `src/data/useCurrentCycle.ts`.

## 5. Capa de datos (`src/data/`)

- **`types.ts`** — agregar:
  - `type MonthKey = string` (formato `'AAAA-MM'`).
  - `interface MonthTx { id: string; transactionDate: string; amount: number; type: TxType;
    channel: Channel | null; categoryName: string | null; accountName: string;
    accountType: AccountType }`.
  - `interface CategorySpendSegment { label: string; amount: number; pct: number }`.

- **`useMonthTransactions.ts`** — query TanStack (`queryKey: ['month-transactions', mes]`).
  Trae las tx con `transaction_date` en `[primer_día_mes, primer_día_mes_siguiente)` (rango
  half-open, calculado en America/Santiago), con `.select('id, transaction_date, amount, type,
  channel, categories(name), accounts!inner(name, type)')` y `.order('transaction_date',
  { ascending: false })`. Mapea a `MonthTx[]` con un `mapMonthTxRow` exportado (patrón de
  `useCurrentCycle.ts`).

- **`monthNav.ts`** — lógica pura (`.test.ts`):
  - `currentMonthKey(today: Date): MonthKey` — mes actual en America/Santiago.
  - `shiftMonth(mes: MonthKey, delta: -1 | 1): MonthKey` — mes anterior/siguiente.
  - `monthLabel(mes: MonthKey): string` — `'Julio 2026'` (es-CL).
  - `monthRange(mes: MonthKey): { start: string; endExclusive: string }` — fechas `'AAAA-MM-DD'`
    para el filtro half-open.
  - Sin números mágicos (nombres de mes vía `Intl`, no arrays hardcodeados si es evitable).

- **`categorySpend.ts`** — lógica pura (`.test.ts`):
  - `TOP_CATEGORIES = 6` (constante).
  - `computeCategorySpend(txs: MonthTx[]): CategorySpendSegment[]` — filtra `type='gasto'`,
    agrupa por `categoryName` (null → `'Sin categoría'`), suma, ordena desc, calcula `pct`
    (0 si el total es 0), y colapsa el resto en un segmento `'Otros'` cuando hay más de
    `TOP_CATEGORIES` categorías. El total para el `pct` es la suma de todos los gastos.

- **`donutGeometry.ts`** — lógica pura (`.test.ts`):
  - `donutArcs(segments: CategorySpendSegment[], geo: { size: number; thickness: number }):
    { label: string; path: string; pct: number }[]` — convierte cada segmento en un arco SVG
    (ángulos acumulados desde -90°, `path` con `A` de círculo). Invariante testeable: los
    ángulos cubren 360° cuando hay datos.

## 6. UI (`src/features/historial/`)

- **Refactor `HistorialScreen.tsx`** — aloja las sub-tabs `SLRD | Gasto | Movimientos`
  (estado local `subtab`, default `'slrd'`) y el `selectedMonth` compartido por Gasto+Movimientos
  (default `currentMonthKey(new Date())`). Renderiza el sub-tab activo.
- **`SlrdTab.tsx`** — extrae el contenido actual de 3b-i (chips de rango + `SlrdLineChart` +
  estados loading/empty/error) **sin cambiar su lógica**. `HistorialScreen` deja de contener esa
  lógica directamente.
- **`MonthNav.tsx`** — control reutilizable `‹  Julio 2026  ›` que recibe `mes` y
  `onChange(nuevoMes)`; usa `shiftMonth` y `monthLabel`.
- **`CategorySpendTab.tsx`** — `MonthNav` + `CategoryDonut` + leyenda-lista (color, categoría,
  monto con `MoneyText`, %). Estados: loading (skeleton), empty ("Sin gastos este mes."), error
  (inline + retry vía `refetch`). Paleta categórica neutral (se define en el plan consultando la
  skill `dataviz`).
- **`CategoryDonut.tsx`** — SVG a mano usando `donutArcs`; theme-aware; un color por segmento
  desde la paleta; sin lógica de negocio (recibe segmentos + colores).
- **`TransactionsTab.tsx`** — `MonthNav` + 3 selects (categoría / tipo / cuenta, con opción
  "Todas"/"Todos") + lista de tx (fecha desc; descripción o categoría; `MoneyText` con signo
  según tipo: **`ingreso` positivo (+); todos los demás (`gasto`, `pago_tarjeta`,
  `transferencia_interna`) negativos (−)**). Filtrado en cliente sobre el mes cargado.
  Estados: loading (skeleton), empty ("Sin movimientos con estos filtros."), error (inline +
  retry).

## 7. Navegación

Sin cambios. El tab "Historial" y su ruta `/historial` ya existen (3b-i).

## 8. Fuera de alcance (backlog v2)

Presupuestos por categoría con alertas, auto-categorización (keyword → categoría), estimación de
gasto (promedio móvil), insights con API de Claude.

## 9. Criterios de aceptación

1. Sin migración; 3b-ii no toca la base de datos.
2. Pantalla Historial con sub-tabs `SLRD | Gasto | Movimientos`; el contenido de 3b-i sigue
   funcionando igual bajo el sub-tab SLRD.
3. Gasto por categoría: dona por mes (navegable), top N + "Otros", "Sin categoría" como segmento,
   leyenda con monto y %, sobre **todos** los gastos (BICE + débito), en TZ Santiago.
4. Movimientos: lista del mes (fecha desc) con filtros categoría/tipo/cuenta; signo por tipo
   (`ingreso` +, resto −).
5. Cada sub-tab con sus 3 estados (loading/empty/error).
6. Lógica pura (`monthNav`, `categorySpend`, `donutGeometry`, mappers) cubierta por `.test.ts`;
   componentes por `.test.tsx`. Sin dependencias nuevas de gráficos.
7. `tsc --noEmit`, `vitest run` y `oxlint` en verde.
