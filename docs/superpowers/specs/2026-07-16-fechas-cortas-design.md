# Fechas ISO crudas → formato corto

**Fecha:** 2026-07-16
**Estado:** aprobado, listo para plan de implementación

## Contexto

Cabo suelto de la crítica de UI/UX: tres lugares muestran la fecha en ISO cruda
(`2026-07-14`) en vez del formato corto que usa el resto de la app. El helper
`formatShortDate` ya existe en [lib/format.ts](../../../src/lib/format.ts) y
devuelve `"14 jul"` (día mes, sin año) — es el formato que ya usa el eje del
gráfico SLRD ([SlrdLineChart.tsx](../../../src/features/historial/SlrdLineChart.tsx)).

Decisión (con Josefa): **reutilizar `formatShortDate` tal cual** en los tres
lugares. Sin año — el mes/contexto ya está visible en pantalla (el header
`MonthNav` "Julio 2026" en Movimientos, el ciclo en la sección de cuotas).

## Alcance

Exactamente tres sitios de render (el resto de la app ya está formateado):

1. **Movimientos** — [TransactionsTab.tsx:105](../../../src/features/historial/TransactionsTab.tsx):
   `{t.transactionDate} · {t.accountName}` → `{formatShortDate(t.transactionDate)} · {t.accountName}`
   Resultado: `14 jul · Santander Vista`.

2. **Ciclo, cuota por vencer** — [UnpaidCyclesSection.tsx:29](../../../src/features/ciclo/UnpaidCyclesSection.tsx):
   `vence {c.dueDate}` → `vence {formatShortDate(c.dueDate)}`
   Resultado: `vence 15 jul`.

3. **Ciclo, cuota vencida** — [UnpaidCyclesSection.tsx:41](../../../src/features/ciclo/UnpaidCyclesSection.tsx):
   `vencía {c.dueDate}` → `vencía {formatShortDate(c.dueDate)}`
   Resultado: `vencía 15 jul`.

En ambos archivos: importar `formatShortDate` desde `../../lib/format`.

## Testing (TDD)

Los tests actuales de `TransactionsTab` y `UnpaidCyclesSection` no asertan el texto
de la fecha renderizada (solo la usan como fixture), así que el TDD es **agregar**
aserciones que fijen el formato nuevo:

- `TransactionsTab`: con un tx de `transactionDate: '2026-07-12'`, la fila muestra
  `12 jul` y NO `2026-07-12`.
- `UnpaidCyclesSection`: con `dueDate: '2026-07-15'`, la cuota por vencer muestra
  `vence 15 jul` y NO `2026-07-15`.

Escribir el test que falla primero (asertando el texto corto sobre el código
actual), verlo fallar, luego aplicar el cambio.

## Verificación

Recorrer Movimientos y Ciclo en 375×812 dark; screenshot confirmando `14 jul` en
Movimientos y `vence 15 jul` en el Ciclo.

## Fuera de alcance

- Formato con año o fechas relativas ("hoy"/"ayer") — descartado por consistencia
  con el resto de la app.
- Cualquier otro cambio de datos o de componentes.
