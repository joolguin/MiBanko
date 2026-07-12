# Estimación de gasto por promedio móvil — Diseño (Backlog v2 #4)

Fecha: 2026-07-12
Estado: aprobado, listo para plan de implementación

## Objetivo

Al fijar o editar el presupuesto de una categoría, sugerirle a la usuaria un monto
realista basado en cuánto gasta en promedio en esa categoría en los últimos meses.
La sugerencia aparece dentro de `BudgetSheet` (el bottom sheet de Presupuestos, #6),
con un selector para elegir la ventana del promedio (3 o 6 meses) y un valor tocable
que carga ese monto en el `NumberPad`.

No afecta el SLRD ni muta datos: es analítica de gasto de solo lectura, coherente con
la definición de gasto usada por Presupuestos.

## Decisiones de alcance (cerradas en brainstorming)

1. **Propósito:** sugerir monto de presupuesto por categoría. No es una proyección del
   mes en curso ni una referencia histórica en la tab Gasto (eso queda fuera).
2. **Ventana del promedio:** la elige la usuaria dentro de la app con un selector
   segmentado **3 meses / 6 meses**. Default: **3 meses** (reacciona más rápido a
   cambios de hábito).
3. **Qué gasto cuenta:** idéntico a Presupuestos #6 — `type === 'gasto'` con
   `categoryId` no nulo (crédito + débito). "Sin categoría" nunca cuenta. Esto mantiene
   la sugerencia coherente con la barra de avance del presupuesto.
4. **Mes en curso:** el mes calendario actual (parcial) **no cuenta**. El promedio se
   calcula solo sobre meses calendario completos anteriores al actual, para no sesgar
   hacia abajo.
5. **Divisor del promedio:** cantidad de meses completos con datos disponibles en el
   rango, con tope en la ventana elegida. Si una categoría apareció en 2 de los últimos
   3 meses, igual se divide por 3 (= "salida mensual típica"). Si sólo existen 2 meses
   de historia en total, se divide por 2 y se informa ("promedio de 2 meses").
6. **Sin historia:** si una categoría no tiene ningún gasto en el rango, el bloque de
   sugerencia se oculta para esa categoría.
7. **Ubicación:** sólo en `BudgetSheet`. No se muestra en la lista de `BudgetsTab`.

## Fuera de alcance (YAGNI)

- Sugerencia en la lista de `BudgetsTab`.
- Proyección del gasto del mes en curso ("vas camino a gastar ~$X").
- Mediana, estacionalidad, ponderación por recencia u otras estadísticas más allá del
  promedio simple.
- Vista/RPC en Postgres pre-agregada.

## Arquitectura

Enfoque elegido: **una sola query de rango + agregación en cliente.** Se traen los
gastos de los últimos 6 meses completos (la ventana máxima) en una consulta; una
función pura agrega por categoría y mes y calcula el promedio sobre la ventana elegida.
Cambiar el selector 3/6 recalcula en cliente, sin volver a la red.

Alternativas descartadas:

- **Reusar `useMonthTransactions` por mes (6 llamadas):** más round-trips y no calza con
  las reglas de hooks (no se puede loopear `useQuery`).
- **Vista/RPC pre-agregada en Postgres:** más eficiente a escala, pero suma una migración
  y una función DB para una app de una sola usuaria con datos chicos. Overkill.

### Capa de datos

**`src/data/monthNav.ts`** — nuevo helper puro:

```
lastCompleteMonths(current: MonthKey, n: number): MonthKey[]
```

Devuelve las `n` claves de mes calendario completas anteriores a `current` (no incluye
`current`), de más antigua a más reciente. Reutiliza `shiftMonth`.

**`src/data/categoryAverages.ts`** — nueva función pura:

```
computeCategoryAverages(
  rows: MonthTx[],
  windowMonths: number,
  monthKeys: MonthKey[],
): Map<string, { avg: number; monthsCounted: number }>
```

- `monthKeys` = los meses completos considerados (los últimos `windowMonths`, derivados
  con `lastCompleteMonths`).
- Filtra `rows` a `type === 'gasto'` con `categoryId` no nulo cuya `transactionDate` cae
  en alguno de los meses de `monthKeys`.
- Agrupa el gasto por `categoryId` sumando montos por mes.
- `avg` = (suma total de la categoría en el rango) / `monthsCounted`.
- `monthsCounted` = cantidad de meses en `monthKeys` que tienen al menos un gasto de
  *cualquier* categoría (es decir, meses con actividad registrada), con tope
  `windowMonths`. Esto hace que el divisor represente "meses de historia disponible",
  no "meses en que esta categoría específica apareció".
- Categorías sin gasto en el rango no aparecen en el Map.

La función es pura: sin fetching, sin fechas del reloj, sin efectos. Recibe `rows` y
`monthKeys` ya calculados por el llamador.

**`src/data/useCategoryAverages.ts`** — nuevo hook:

- Deriva `currentMonthKey(new Date())` y `lastCompleteMonths(current, 6)` (siempre trae
  la ventana máxima; el recorte a 3 lo hace el consumidor recalculando en cliente).
- `queryKey: ['category-averages']`.
- Trae con Supabase los gastos (`type = 'gasto'`, `category_id not null`) cuya
  `transaction_date` cae en `[inicio del mes más antiguo, inicio del mes actual)`,
  mapeando filas con `mapMonthTxRow` (reutilizado de `useMonthTransactions`).
- Read-only: no participa de ninguna invalidación de caché. (Nota: como no observa
  mutaciones de `transactions`, puede quedar hasta el `staleTime` por defecto detrás de
  un gasto recién creado; es aceptable para una sugerencia orientativa.)

### Capa UI

**`src/features/historial/BudgetSheet.tsx`** — se agrega un bloque de sugerencia entre
el visor de monto y el `NumberPad` (o inmediatamente bajo el `NumberPad`):

- Selector segmentado **3 meses / 6 meses** (default 3), mismo lenguaje visual que los
  chips de tabs existentes.
- Consume `useCategoryAverages()` y `computeCategoryAverages(rows, windowMonths, ...)`
  para el `categoryId` abierto.
- Si hay promedio para la categoría: muestra "Promedio: $X" con `MoneyText`, tocable;
  al tocar, hace `setAmount(Math.round(avg))`. Si `monthsCounted < windowMonths`,
  muestra el subtexto "promedio de N meses".
- Si no hay promedio (categoría sin historia o hook cargando/errando): el bloque no se
  renderiza. El resto del sheet funciona igual que hoy.

El cálculo del promedio por ventana se memoiza (`useMemo`) sobre `rows` y `windowMonths`.

## Manejo de errores y estados

- Hook cargando o con error → el bloque de sugerencia simplemente no aparece; el sheet
  sigue siendo usable para fijar el monto a mano. No se muestra spinner ni error propio
  (la sugerencia es opcional, no debe bloquear la tarea principal).
- Categoría sin `categoryId` (no debería pasar al abrir el sheet, pero por robustez) →
  sin sugerencia.

## Plan de pruebas

- **`monthNav.test.ts`** (extiende el existente): `lastCompleteMonths` — cantidad
  correcta, orden ascendente, excluye el mes actual, cruza límites de año.
- **`categoryAverages.test.ts`** (nuevo): ventana 3 y 6; historia parcial (categoría en
  algunos meses); sin historia (Map vacío o categoría ausente); divisor con menos meses
  que la ventana; ignora ingresos, `pago_tarjeta`, transferencias y gastos sin categoría.
- **`BudgetSheet.test.tsx`** (extiende el existente): con datos mockeados, aparece la
  línea de promedio; al tocarla se carga el monto; con el selector en 6 meses cambia el
  valor; sin historia para la categoría, el bloque no aparece.

## Estándares

Todo el código sigue **clean-code-standards**: nombres reveladores en español/inglés
según convención del repo, guard clauses, SRP (núcleo puro separado de fetching y de
UI), inmutabilidad, y funciones chicas y testeables. Commits en Conventional Commits.
