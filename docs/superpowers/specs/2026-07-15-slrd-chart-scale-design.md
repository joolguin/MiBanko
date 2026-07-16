# Gráfico del SLRD: escala propia y eje legible

Fecha: 2026-07-15
Estado: aprobado

## Problema

El gráfico de la tab SLRD en Historial no deja leer el SLRD, que es el número
protagonista de la app.

Medido en el navegador con los datos reales (6 puntos, 9 al 14 de julio de 2026):

| Métrica | Valor |
| --- | --- |
| Recorrido vertical de la línea del SLRD | **0,7 px** |
| Alto del gráfico | 160 px |
| Porcentaje del alto que usa el SLRD | **0,5 %** |
| Recorrido vertical del saldo contable | **0 px** (recta) |

Los datos: el SLRD estuvo en $115.000 y bajó a $103.780 el 12 de julio. Un
escalón de **$11.220** — un 10,8 % de la plata disponible — dibujado en 0,7 px.
Con un eje propio usaría los 160 px: **214× más resolución**.

**Causa raíz**, en `chartScale.ts:45-47`:

```ts
const values = points.flatMap((p) => [p.slrdInmediato, p.saldoContable])
const yMin = Math.min(...values)
const yMax = Math.max(...values)
```

El dominio sale de las dos series. Como el saldo contable ($2.500.000) es ~24×
el SLRD ($103.780), fija el techo y aplasta al SLRD contra el piso.

No es el anti-patrón de doble eje: las dos series comparten unidad (pesos) y un
solo eje, que es correcto. El problema es la diferencia de magnitud. Ninguna
escala común puede mostrar las dos: aunque el contable variara $100.000, el
recorrido de $11.220 del SLRD seguiría siendo invisible.

### El bug está testeado como comportamiento deseado

`chartScale.test.ts:45` se llama `should_ComputeDomainFromBothSeries_When_Built` y
afirma `chart.yMax === 150` (el máximo del saldo contable). No es que falte
cobertura: **la cobertura defiende el bug**. Ese test se reemplaza, no se agrega
uno al lado.

### Problemas secundarios en el mismo gráfico

- El eje va exactamente de `yMin` a `yMax`, así que la línea se apoya sobre el
  borde (medido: `y = 160` en un gráfico de 160 px de alto). No hay lugar para un
  punto final ni para un marcador.
- La serie del contable es punteada (`strokeDasharray="4 3"`), lo que lee como
  umbral o proyección cuando en realidad es un valor observado.
- Las fechas de los ejes son ISO crudas: `2026-07-09`.

## Decisiones de diseño

Tomadas por Josefa sobre mockups con los datos reales:

1. **El saldo contable sale del gráfico.** Sigue en el tooltip al tocar un punto,
   y el Dashboard ya hace el contraste con el $2.500.000 tachado. Es una recta:
   no aporta tendencia, solo rompe la escala.
2. **El eje arranca en 100.000, no en cero.** Es lo correcto para una línea de
   tendencia —con base cero el escalón volvería a medir ~10 % del alto— asumiendo
   que exagera la variación respecto del patrimonio total.
3. **El helper de fechas se usa solo en el gráfico.** Movimientos y Ciclo
   conservan sus fechas ISO hasta tener su propia propuesta.

## Diseño

### niceDomain

Nueva función en `src/data/chartScale.ts`:

```ts
export function niceDomain(min: number, max: number, tickCount = 3):
  { min: number; max: number; step: number; ticks: number[] }
```

Redondea el dominio a topes y pasos "lindos" (1, 2, 5 o 10 por magnitud). Para
los datos reales (103.780 → 115.000) da `{ min: 100000, max: 120000, step: 10000,
ticks: [100000, 110000, 120000] }`.

Se adapta al rango: si el SLRD varía $50, los ticks se achican solos.

**Guarda obligatoria**: si `max === min` (serie plana, que es un caso real —el
contable lo es hoy y el SLRD podría serlo), el rango es 0 y `Math.log10(0)` da
`-Infinity`. En ese caso se expande el rango a `Math.abs(min) * 0.1 || 1` antes
de redondear.

### buildChart

El dominio pasa a salir solo de `slrdInmediato`. La función devuelve un único
`path` (más `areaPath` para el relleno) en vez del array `series` de dos, y suma
`ticks` para las gridlines. `yMin`/`yMax` conservan el nombre y pasan a ser los
extremos del dominio redondeado.

El eje X no cambia: sigue siendo proporcional a la fecha real, no al índice.

### El componente

- Se va el `path` del saldo contable y, con él, la leyenda: con una sola serie no
  hace falta.
- Gridlines de hairline **sólido** en `ink-line`, una por tick. Sólidas y no
  punteadas a propósito: el punteado lee como umbral.
- Relleno de área bajo la línea, accent al 8 %.
- Punto final de 9 px con anillo de 2 px del color de la superficie, y etiqueta
  directa solo sobre el último valor. Nunca un número por punto.
- Márgenes: hoy el plot va de 0 a `width` y de 0 a `height`, así que un punto
  final quedaría cortado al medio. El plot pasa a 264×150 dentro de un SVG de
  320×186, corrido con un `<g transform>`. `buildChart` sigue mapeando a la caja
  del plot sin enterarse.
- El área táctil por punto sube de r=10 a r=12 (24 px de diámetro, el mínimo que
  pide la skill de dataviz para hit targets).

### formatShortDate

Nueva función en `src/lib/format.ts`: `formatShortDate('2026-07-09') === '9 jul'`.

Implementada con string-splitting puro, **sin construir un `Date`**. Parsear
`'2026-07-09'` con `new Date()` da medianoche UTC y es exactamente así como una
fecha se corre un día en este proyecto (ver la memoria de Santiago vs UTC). Sin
`Date` no hay zona horaria y no hay corrimiento posible.

## Fuera de alcance

La skill de dataviz pide un "table view" gemelo de todo gráfico, para que ningún
valor sea accesible solo por tooltip. Con 6 puntos y un tooltip que ya muestra el
desglose completo (SLRD, contable, deuda facturada y no facturada) sería
sobreingeniería. A reevaluar si el historial crece a cientos de puntos.

## Verificación

**Tests unitarios** (convención `should_X_When_Y`):

- `chartScale.test.ts`: el dominio sale solo del SLRD; `niceDomain` redondea;
  `niceDomain` sobrevive a una serie plana.
- `SlrdLineChart.test.tsx`: se renderiza un solo path de serie; las fechas de los
  ejes salen en formato corto.
- `format.test.ts`: `formatShortDate` para varios meses y sin corrimiento de día.

**Tests existentes a reemplazar** (afirman el comportamiento viejo):

- `should_ComputeDomainFromBothSeries_When_Built`
- `should_BuildTwoSeriesPaths_When_Built`
- `should_MapMaxValue_ToTopAndMinToBottom` (el mapeo cambia con el dominio redondeado)
- `should_RenderTwoSeriesPaths_When_GivenPoints`
- `should_ShowMinMaxAxesAndFirstLastDates_When_GivenTwoOrMorePoints` (espera `$250`,
  el máximo del contable)

**Tests que NO se tocan**: tooltip, pin/hover y espaciado por fecha real. Ese
comportamiento se conserva entero.

**Verificación en navegador**:

- El recorrido vertical de la línea del SLRD pasa de 0,7 px a más de 50.
- Ningún punto de la línea toca el borde del plot.
- El punto final se ve entero, sin recorte.
- Las fechas de los ejes dicen `9 jul` / `14 jul`.

## Criterios de aceptación

- La línea del SLRD usa una porción sustancial del alto del gráfico (>30 %).
- El saldo contable no aparece como serie, pero sí en el tooltip.
- El punto final se renderiza completo dentro del SVG.
- Las fechas de los ejes están en formato corto en español.
- El tooltip y el pin/hover siguen funcionando igual.
