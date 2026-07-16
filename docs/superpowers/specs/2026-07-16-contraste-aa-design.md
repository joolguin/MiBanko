# Contraste: los grises de texto pasan WCAG AA

Fecha: 2026-07-16
Estado: aprobado

## Problema

Dos tokens de Tailwind usados como "texto atenuado" en toda la app no alcanzan el
mínimo de 4.5:1 que pide WCAG 2.1 AA (criterio 1.4.3) sobre el fondo de la app.

Medido en el navegador contra el fondo real, que es **#09090b** (`ink.DEFAULT`,
que `tokens.css` fija en `html, body, #root`), no `ink-1` como decía la crítica
inicial:

| Token | Hex | Ratio | ¿Pasa 4.5:1? | Usos |
| --- | --- | --- | --- | --- |
| `zinc-600` | `#52525b` | **2.57:1** | no | 23 |
| `zinc-500` | `#71717a` | **4.12:1** | no | 41 |
| `zinc-400` | `#a1a1aa` | 7.76:1 | sí | 27 |

No son textos sueltos: son dos tokens. Fallos por pantalla:

| Pantalla | Fallos |
| --- | --- |
| Dashboard | 7 |
| Ciclo | 13 |
| Historial · SLRD | 6 (5 en el SVG) |
| Historial · Gasto | 6 |
| Historial · Presupuestos | 3 |
| Historial · Movimientos | 10 |
| Ajustes | 6 |
| Registro | 1, más el placeholder |

El placeholder de la descripción en Registro usa `placeholder:text-zinc-600`:
2.57:1. Un placeholder es texto y le aplica el mismo mínimo.

### La auditoría inicial era ciega a los SVG

La primera versión del script leía `getComputedStyle(el).color`. Los `<text>` de
SVG **no pintan con `color`, pintan con `fill`**, así que el script les leía el
color heredado del `body` (`#f4f4f5`) y los reportaba pasando con ~17:1.

Con la lectura corregida, 5 de los 6 textos del gráfico del SLRD fallan: los tres
ticks del eje y las dos fechas usan `fill-zinc-500` (4.12:1). El gráfico se mergeó
con ese defecto adentro.

## Decisión de diseño

La superficie casi negra no da para tres grises atenuados legales bien separados:
entre el mínimo que pasa (4.55:1) y el `zinc-400` que ya se usa (7.76:1) hay lugar
para un nivel intermedio, no dos.

Josefa eligió **conservar los tres niveles** (sobre "fusionar en dos" y "todo a
zinc-400"), asumiendo que los escalones quedan más sutiles que hoy.

`zinc-400` **no se toca**: ya pasa.

## Diseño

### Dos tokens nuevos

En `tailwind.config.js`, junto a `ink` / `accent` / `debt`:

```js
faint: '#787881',  // 4.55:1 sobre ink — el nivel más recesivo
muted: '#8c8c95',  // 5.97:1 sobre ink — texto secundario
```

Los valores salen de un barrido con el tinte zinc (`b = r + 9`): `#787881` es el
**mínimo** que pasa 4.5:1, elegido para conservar la mayor recesividad posible.

Los nombres describen brillo, no rol. `zinc-600` no se usa solo en labels: también
pinta el monto tachado, el `(total)` y el placeholder, así que `label` o `meta`
serían nombres falsos.

### Reemplazos

64 en total, mecánicos:

| De | A | Usos |
| --- | --- | --- |
| `text-zinc-600` | `text-faint` | 22 |
| `placeholder:text-zinc-600` | `placeholder:text-faint` | 1 |
| `text-zinc-500` | `text-muted` | 38 |
| `fill-zinc-500` | `fill-muted` | 3 |

Ningún test afirma esas clases (verificado con grep), así que la suite no se ve
afectada por el reemplazo en sí.

## Fuera de alcance

`text-zinc-400` (7.76:1, 27 usos) pasa AA pero queda con nombre de Tailwind
mientras sus dos hermanos tienen nombre propio. Renombrarlo a `text-soft` daría
consistencia, pero son 27 cambios más que no arreglan ningún bug. Queda como deuda
anotada.

## Verificación

**Test unitario** — acá sí hay algo testeable de verdad: el contraste es una
función pura de dos hex.

`src/theme/contrast.test.ts` importa `tailwind.config.js`, lee los valores reales
de los tokens y afirma que dan ≥4.5:1 contra `ink.DEFAULT`. **No duplica los hex**:
los lee de la fuente de verdad, así que si alguien oscurece `faint` el test lo caza.
Es el único guardián automático posible; jsdom no computa color contra fondo.

También afirma la premisa del problema: que `zinc-600` y `zinc-500` **no** pasan.
Si un día Tailwind los cambia, ese test avisa que el spec quedó viejo.

**Verificación en navegador**: re-auditar las 8 pantallas con el script corregido
(que lee `fill` en SVG y `color` en HTML) y confirmar 0 fallos en todas.

## Criterios de aceptación

- Las 8 pantallas dan 0 fallos de contraste AA para texto.
- El placeholder de Registro pasa 4.5:1.
- Los textos del SVG del gráfico pasan 4.5:1.
- `zinc-400` sigue en uso, sin cambios.
- La suite existente sigue en verde.
